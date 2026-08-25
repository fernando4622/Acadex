"""
Router de Docentes â€” CRUD completo + reset de contraseÃ±a.
Solo ADMIN puede crear/editar/eliminar docentes.
"""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection, UniqueViolationError
from pydantic import BaseModel, EmailStr, field_validator
from uuid import UUID
import unicodedata
import re
from app.database import get_conn
from app.auth.authorization import assert_can_read_teacher_record
from app.middleware.auth import require_admin, get_current_user
from app.auth.service import hash_password

router = APIRouter(prefix="/docentes", tags=["Docentes"])


# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def clean_for_email(s: str) -> str:
    """Limpia una cadena para usarla en un correo (minÃºsculas, sin acentos, sin espacios)."""
    if not s: return ""
    s = s.strip().lower()
    # Quitar acentos
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    # Quitar caracteres no alfanumÃ©ricos
    s = re.sub(r'[^a-z0-9]', '', s)
    return s

def generar_email_docente(nombre: str, ap_pat: str, ap_mat: str | None) -> str:
    """Genera el correo institucional: nombre + paterno + materno (opc) + @veracruz.tecnm.mx"""
    prefix = clean_for_email(nombre) + clean_for_email(ap_pat) + clean_for_email(ap_mat or "")
    return f"{prefix}@veracruz.tecnm.mx"

def generar_password_docente(fecha_nac: date) -> str:
    """Genera la contraseÃ±a provisional (YYYYMMDD)."""
    return fecha_nac.strftime("%Y%m%d")

# â”€â”€ Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class DocenteCreateFull(BaseModel):
    num_empleado: str
    nombre: str
    apellido_pat: str
    apellido_mat: Optional[str] = None
    fecha_nacimiento: date
    email: Optional[str] = None      # Si no se envÃ­a, se genera
    password: Optional[str] = None   # Si no se envÃ­a, se genera (provisional)
    activo: bool = True

    @field_validator("*", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        if v == "":
            return None
        return v


class DocenteUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido_pat: Optional[str] = None
    apellido_mat: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    email: Optional[str] = None
    activo: Optional[bool] = None

    @field_validator("*", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        if v == "":
            return None
        return v


class ResetPasswordBody(BaseModel):
    nueva_password: str


# â”€â”€ Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("")
async def listar_docentes(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    rows = await conn.fetch(
        """SELECT d.id, d.num_empleado, d.nombre, d.apellido_pat, d.apellido_mat,
                  d.fecha_nacimiento, d.email, d.activo, d.created_at,
                  u.id AS usuario_id, u.activo AS usuario_activo, u.ultimo_acceso,
                  (SELECT COUNT(*) FROM academ.grupo g
                   JOIN academ.periodo_academico p ON p.id = g.periodo_id
                   WHERE g.docente_id = d.id AND LOWER(p.estado) <> 'cerrado') AS grupos_activos
           FROM academ.docente d
           LEFT JOIN academ.usuario u ON u.id = d.usuario_id
           ORDER BY d.apellido_pat, d.nombre"""
    )
    return [dict(r) for r in rows]


@router.get("/me/kardex")
async def obtener_kardex_propio(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """
    Para el docente autenticado: devuelve todos sus grupos histÃ³ricos
    agrupados con datos de periodo y materia.
    """
    docente_id = user.get("id_entidad")
    if not docente_id:
        raise HTTPException(403, detail={"codigo": "SIN_PERMISO", "mensaje": "Solo disponible para docentes."})

    rows = await conn.fetch(
        """SELECT
            g.id as grupo_id,
            g.nombre as grupo,
            g.estado,
            g.letra_grupo,
            m.nombre as materia,
            p.id as periodo_id,
            p.nombre as periodo_nombre,
            p.codigo as periodo_codigo,
            (p.estado = 'activo') as periodo_activo,
            COUNT(i.id) FILTER (WHERE i.estado = 'ACTIVA') as total_alumnos,
            ROUND(AVG(rm.resultado_final)::numeric, 2) as promedio_grupo,
            COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70) as aprobados
        FROM academ.grupo g
        JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
        JOIN academ.materia m ON m.id = pm.materia_id
        JOIN academ.periodo_academico p ON p.id = g.periodo_id
        LEFT JOIN academ.inscripcion i ON i.grupo_id = g.id
        LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id AND i.estado = 'ACTIVA'
        WHERE g.docente_id = $1
        GROUP BY g.id, g.nombre, g.estado, g.letra_grupo, m.nombre,
                 p.id, p.nombre, p.codigo, p.estado, p.fecha_inicio
        ORDER BY p.fecha_inicio DESC, g.nombre""",
        docente_id,
    )
    return [dict(r) for r in rows]


@router.get("/{docente_id}")
async def obtener_docente(
    docente_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    assert_can_read_teacher_record(user, docente_id)
    row = await conn.fetchrow(
        """SELECT d.id, d.num_empleado, d.nombre, d.apellido_pat, d.apellido_mat,
                  d.fecha_nacimiento, d.email, d.activo, d.created_at, d.updated_at,
                  u.id AS usuario_id, u.ultimo_acceso
           FROM academ.docente d
           LEFT JOIN academ.usuario u ON u.id = d.usuario_id
           WHERE d.id = $1""",
        docente_id,
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Docente no encontrado."})
    return dict(row)


@router.post("", status_code=201)
async def crear_docente(
    body: DocenteCreateFull,
    conn: Connection = Depends(get_conn),
    admin: dict = Depends(require_admin),
):
    """
    Crea un docente. Genera automÃ¡ticamente el correo institucional y la contraseÃ±a
    provisional (fecha de nacimiento sin guiones) si no se proporcionan.
    """
    # GeneraciÃ³n automÃ¡tica si faltan
    email_inst = body.email or generar_email_docente(body.nombre, body.apellido_pat, body.apellido_mat)
    pw_texto   = body.password or generar_password_docente(body.fecha_nacimiento)
    pw_hashed  = hash_password(pw_texto)

    try:
        async with conn.transaction():
            # 1. Crear el usuario de acceso primero (para cumplir con restricciones de integridad si las hay)
            # y obtener su ID.
            usuario_row = await conn.fetchrow(
                """INSERT INTO academ.usuario (email, password_hash)
                   VALUES ($1, $2) RETURNING id""",
                email_inst, pw_hashed,
            )
            usuario_id = usuario_row["id"]

            # 2. Asignar rol DOCENTE
            rol_id = await conn.fetchval("SELECT id FROM academ.rol WHERE nombre='DOCENTE'")
            if not rol_id:
                raise HTTPException(500, detail={"codigo": "ROL_FALTANTE", "mensaje": "El rol 'DOCENTE' no existe."})
            
            await conn.execute(
                "INSERT INTO academ.usuario_rol (usuario_id, rol_id, asignado_por) VALUES ($1, $2, $3)",
                usuario_id, rol_id, UUID(admin["sub"]),
            )

            # 3. Crear docente vinculado
            docente_row = await conn.fetchrow(
                """INSERT INTO academ.docente
                       (num_empleado, nombre, apellido_pat, apellido_mat, fecha_nacimiento, email, activo, usuario_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   RETURNING id, num_empleado, nombre, apellido_pat, apellido_mat, fecha_nacimiento, email, activo""",
                body.num_empleado, body.nombre, body.apellido_pat,
                body.apellido_mat, body.fecha_nacimiento, email_inst, body.activo, usuario_id,
            )

            result = dict(docente_row)
            result["usuario_id"] = str(usuario_id)
            result["password_provisional"] = pw_texto  # Se devuelve para que el admin lo entregue
            result["username"] = email_inst
            return result

    except UniqueViolationError as e:
        detail = str(e).lower()
        if "num_empleado" in detail:
            raise HTTPException(409, detail={"codigo": "NUM_EMPLEADO_DUPLICADO", "mensaje": f"El nÃºmero de empleado '{body.num_empleado}' ya estÃ¡ registrado."})
        elif "usuario" in detail or "email" in detail:
            raise HTTPException(409, detail={"codigo": "EMAIL_DUPLICADO", "mensaje": f"El correo institucional '{email_inst}' ya estÃ¡ en uso."})
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": "Ya existe un docente con estos datos Ãºnicos."})
    except Exception as e:
        # Otros errores
        raise HTTPException(500, detail={"codigo": "ERROR_INTERNO", "mensaje": str(e)})



@router.put("/{docente_id}")
async def actualizar_docente(
    docente_id: UUID,
    body: DocenteUpdate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    if not campos:
        raise HTTPException(422, detail={"codigo": "SIN_CAMBIOS", "mensaje": "No se enviaron campos."})

    set_clause = ", ".join(f"{k}=${i+2}" for i, k in enumerate(campos))
    values = list(campos.values())

    try:
        row = await conn.fetchrow(
            f"""UPDATE academ.docente SET {set_clause}, updated_at=NOW()
                WHERE id=$1
                RETURNING id, num_empleado, nombre, apellido_pat, apellido_mat, fecha_nacimiento, email, activo""",
            docente_id, *values,
        )
    except UniqueViolationError:
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": "Email ya existe."})

    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Docente no encontrado."})
    return dict(row)


@router.post("/{docente_id}/reset-password", status_code=200)
async def reset_password_docente(
    docente_id: UUID,
    body: ResetPasswordBody,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """Resetea la contraseÃ±a del usuario vinculado a este docente."""
    usuario_id = await conn.fetchval(
        "SELECT usuario_id FROM academ.docente WHERE id=$1", docente_id
    )
    if not usuario_id:
        raise HTTPException(404, detail={
            "codigo": "SIN_USUARIO",
            "mensaje": "El docente no tiene usuario de acceso asignado.",
        })

    pw_hash = hash_password(body.nueva_password)
    await conn.execute(
        "UPDATE academ.usuario SET password_hash=$1 WHERE id=$2",
        pw_hash, usuario_id,
    )
    return {"mensaje": "ContraseÃ±a actualizada correctamente."}


@router.post("/{docente_id}/crear-acceso", status_code=201)
async def crear_acceso_docente(
    docente_id: UUID,
    body: ResetPasswordBody,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """Crea el usuario de acceso para un docente que aÃºn no lo tiene."""
    docente = await conn.fetchrow(
        "SELECT id, email, usuario_id FROM academ.docente WHERE id=$1", docente_id
    )
    if not docente:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Docente no encontrado."})
    if docente["usuario_id"]:
        raise HTTPException(409, detail={"codigo": "YA_TIENE_ACCESO", "mensaje": "El docente ya tiene usuario de acceso."})

    async with conn.transaction():
        pw_hash = hash_password(body.nueva_password)
        rol_row = await conn.fetchrow("SELECT id FROM academ.rol WHERE nombre='DOCENTE'")

        usuario_row = await conn.fetchrow(
            "INSERT INTO academ.usuario (email, password_hash) VALUES ($1, $2) RETURNING id",
            docente["email"], pw_hash,
        )
        usuario_id = usuario_row["id"]

        await conn.execute(
            "INSERT INTO academ.usuario_rol (usuario_id, rol_id) VALUES ($1, $2)",
            usuario_id, rol_row["id"],
        )
        await conn.execute(
            "UPDATE academ.docente SET usuario_id=$1 WHERE id=$2",
            usuario_id, docente_id,
        )

    return {"mensaje": "Acceso creado correctamente.", "usuario_id": str(usuario_id)}


@router.get("/{docente_id}/grupos")
async def grupos_del_docente(
    docente_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """Lista los grupos histÃ³ricos del docente con mÃ©tricas bÃ¡sicas."""
    assert_can_read_teacher_record(user, docente_id)
    rows = await conn.fetch(
        """SELECT g.id, g.nombre, g.letra_grupo AS clave_grupo, g.estado,
                  m.nombre AS materia, p.codigo AS periodo, p.estado AS estado_periodo,
                  COUNT(i.id) AS total_alumnos
           FROM academ.grupo g
           JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
           JOIN academ.materia m ON m.id = pm.materia_id
           JOIN academ.periodo_academico p ON p.id = g.periodo_id
           LEFT JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
           WHERE g.docente_id = $1
           GROUP BY g.id, g.nombre, g.letra_grupo, g.estado, m.nombre, p.codigo, p.estado, p.fecha_inicio
           ORDER BY p.fecha_inicio DESC, g.nombre""",
        docente_id,
    )
    return [dict(r) for r in rows]


@router.get("/{docente_id}/analytics")
async def obtener_analytics_docente(
    docente_id: str,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin)
):
    stats = await conn.fetchrow(
        """SELECT 
            COUNT(DISTINCT g.id) as total_grupos,
            ROUND(AVG(rm.resultado_final)::numeric, 2) as promedio_otorgado,
            COUNT(DISTINCT i.alumno_id) as total_alumnos_atendidos
        FROM academ.grupo g
        LEFT JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
        LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
        WHERE g.docente_id = $1""",
        docente_id
    )
    
    grupos = await conn.fetch(
        """SELECT
            g.nombre as grupo,
            m.nombre as materia,
            p.codigo as periodo,
            p.id as periodo_id,
            c.id as carrera_id,
            c.nombre as carrera_nombre,
            ARRAY[c.id] as carreras_ids,
            c.nombre as carreras,
            COUNT(rm.id) as total,
            COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70) as aprobados,
            ROUND(AVG(rm.resultado_final)::numeric, 2) as promedio
        FROM academ.grupo g
        JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
        JOIN academ.materia m ON m.id = pm.materia_id
        JOIN academ.periodo_academico p ON p.id = g.periodo_id
        JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
        JOIN academ.carrera c ON c.id = pe.carrera_id
        LEFT JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
        LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
        WHERE g.docente_id = $1
        GROUP BY g.id, g.nombre, m.nombre, m.id, p.codigo, p.id, c.id, c.nombre
        ORDER BY p.fecha_inicio DESC, g.nombre""",
        docente_id
    )
    
    return {
        "stats": {
            "total_grupos": stats["total_grupos"] or 0,
            "promedio_otorgado": float(stats["promedio_otorgado"] or 0),
            "total_alumnos_atendidos": stats["total_alumnos_atendidos"] or 0
        },
        "grupos": [dict(g) for g in grupos]
    }

