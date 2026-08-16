from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from asyncpg import Connection, UniqueViolationError

from app.database import get_conn
from app.middleware.auth import require_admin, require_docente_o_admin, get_current_user, is_alumno
from app.auth.service import hash_password
from app.schemas.alumno import (
    AlumnoCreate, AlumnoUpdate, AlumnoResponse,
    AlumnoCreatedResponse, AlumnoImportPreview,
)

router = APIRouter(prefix="/alumnos", tags=["Alumnos"])




def _nip_from_fecha(fecha_nacimiento: str) -> str:
    """Calcula NIP provisional como YYYYMMDD desde una fecha YYYY-MM-DD."""
    return fecha_nacimiento.replace("-", "")


def _correo_institucional(no_control: str) -> str:
    return f"L{no_control}@veracruz.tecnm.mx"


# ══════════════════════════════════════════════════════════════════════════════
# RUTAS ESTÁTICAS (ANTES de /{alumno_id})
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/me/perfil", response_model=AlumnoResponse)
async def obtener_perfil_mio(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    if not is_alumno(user):
         raise HTTPException(403, detail={"codigo": "SOLO_ALUMNOS", "mensaje": "Solo alumnos pueden ver su perfil"})
    
    row = await conn.fetchrow(
           """
           SELECT a.id, a.no_control, a.curp, a.nombre, a.apellido_pat, a.apellido_mat,
                  a.email, COALESCE(a.semestre_actual, 0) AS semestre,
                  a.fecha_nacimiento::TEXT AS fecha_nacimiento,
                  a.activo, a.usuario_id, a.plan_estudio_id, pe.nombre AS plan_nombre, pe.carrera_id
           FROM academ.alumno a
           LEFT JOIN academ.plan_estudio pe ON pe.id = a.plan_estudio_id
           WHERE a.id=$1
           """,
        user["id_entidad"],
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Perfil no encontrado"})
    return dict(row)

@router.get("/me/avance")
async def obtener_avance_mio(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    if not is_alumno(user):
         raise HTTPException(403, detail={"codigo": "SOLO_ALUMNOS", "mensaje": "Solo alumnos pueden ver su avance"})
         
    # 1. Obtener plan_id del alumno
    plan_id = await conn.fetchval("SELECT plan_estudio_id FROM academ.alumno WHERE id = $1::uuid", user["id_entidad"])
    if not plan_id:
        return {"plan_id": None, "materias": []}
        
    # 2. Obtener todas las materias del plan
    plan_materias = await conn.fetch(
        """SELECT pm.id, pm.clave, pm.materia_id, pm.semestre, pm.orden, pm.obligatoria,
                  m.nombre as materia_nombre, m.creditos
           FROM academ.plan_materia pm
           JOIN academ.materia m ON m.id = pm.materia_id
           WHERE pm.plan_estudio_id = $1
           ORDER BY pm.semestre, pm.orden""",
        plan_id
    )
    
    # 3. Obtener resultados del alumno desde la tabla consolidada de avance_reticular
    resultados = await conn.fetch(
        """SELECT pm.materia_id, ar.calificacion, ar.estado
           FROM academ.avance_reticular ar
           JOIN academ.plan_materia pm ON pm.id = ar.plan_materia_id
           WHERE ar.alumno_id = $1::uuid""",
        user["id_entidad"]
    )
    
    res_dict = {r["materia_id"]: dict(r) for r in resultados}
    
    materias_final = []
    for pm in plan_materias:
        m = dict(pm)
        res = res_dict.get(pm["materia_id"])
        m["calificacion"] = res["calificacion"] if res else None
        m["estado_academico"] = res["estado"] if res else 'NO_CURSADA'
        materias_final.append(m)
        
    plan_nombre = await conn.fetchval("SELECT nombre FROM academ.plan_estudio WHERE id = $1", plan_id)
    
    return {
        "plan_id": plan_id,
        "plan_nombre": plan_nombre,
        "materias": materias_final
    }



@router.get("", response_model=list[AlumnoResponse])
async def listar_alumnos(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_docente_o_admin),
):
    rows = await conn.fetch(
        """
        SELECT a.id, a.no_control, a.curp,
               a.nombre, a.apellido_pat, a.apellido_mat,
               a.email,
               COALESCE(a.semestre_actual, 0) AS semestre,
               a.fecha_nacimiento::TEXT AS fecha_nacimiento,
               a.activo, a.usuario_id, a.plan_estudio_id, pe.nombre AS plan_nombre, pe.carrera_id
        FROM academ.alumno a
        LEFT JOIN academ.plan_estudio pe ON pe.id = a.plan_estudio_id
        ORDER BY a.no_control NULLS LAST
        """
    )
    return [dict(r) for r in rows]



@router.post("", status_code=201, response_model=AlumnoCreatedResponse)
async def crear_alumno(
    body: AlumnoCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Registra un alumno nuevo. En una sola transacción:
    1. Genera no_control vía fn_generar_no_control
    2. Genera email = L{no_control}@veracruz.tecnm.mx
    3. Crea usuario (email = correo institucional, password = NIP)
    """
    if not body.fecha_nacimiento:
        raise HTTPException(400, detail={
            "codigo": "FECHA_REQUERIDA",
            "mensaje": "La fecha de nacimiento es obligatoria para generar el NIP provisional."
        })

    nip_texto = _nip_from_fecha(body.fecha_nacimiento)
    nip_hashed = hash_password(nip_texto)

    async with conn.transaction():
        if body.curp:
            existe = await conn.fetchval(
                "SELECT id FROM academ.alumno WHERE curp = $1", body.curp
            )
            if existe:
                raise HTTPException(409, detail={
                    "codigo": "CURP_DUPLICADO",
                    "mensaje": f"Ya existe un alumno con CURP {body.curp}."
                })

        no_control = await conn.fetchval(
            "SELECT academ.fn_generar_no_control(EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT)"
        )
        email_inst = _correo_institucional(no_control)

        try:
            alumno_row = await conn.fetchrow(
                """
                INSERT INTO academ.alumno (
                    no_control, nombre, apellido_pat, apellido_mat,
                    fecha_nacimiento, curp, email, semestre_actual, plan_estudio_id
                )
                VALUES ($1, $2, $3, $4, $5::text::date, $6, $7, 1, $8)
                RETURNING id, no_control, curp,
                          nombre, apellido_pat, apellido_mat,
                          email, semestre_actual AS semestre,
                          fecha_nacimiento::TEXT AS fecha_nacimiento,
                          activo, usuario_id, plan_estudio_id
                """,
                no_control, body.nombre, body.apellido_pat, body.apellido_mat,
                body.fecha_nacimiento, body.curp, email_inst, body.plan_estudio_id
            )
        except UniqueViolationError:
            raise HTTPException(409, detail={
                "codigo": "DUPLICADO",
                "mensaje": "Dato duplicado al crear alumno (CURP o matrícula ya existe)."
            })

        alumno_id = alumno_row["id"]

        # Se usa el correo institucional (email_inst) para la tabla usuario para cumplir con chk_usuario_email
        usuario_id = await conn.fetchval(
            "INSERT INTO academ.usuario (email, password_hash) VALUES ($1, $2) RETURNING id",
            email_inst, nip_hashed,
        )

        rol_id = await conn.fetchval("SELECT id FROM academ.rol WHERE nombre = 'ALUMNO'")
        if rol_id:
            await conn.execute(
                "INSERT INTO academ.usuario_rol (usuario_id, rol_id) VALUES ($1, $2)",
                usuario_id, rol_id,
            )

        await conn.execute(
            "UPDATE academ.alumno SET usuario_id = $1 WHERE id = $2",
            usuario_id, alumno_id,
        )

    result = dict(alumno_row)
    result["usuario_id"] = usuario_id
    result["nip_provisional"] = nip_texto
    result["username"] = email_inst  # El identificador de acceso ahora es el correo
    return result




# ══════════════════════════════════════════════════════════════════════════════
# RUTAS DINÁMICAS (con {alumno_id})
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{alumno_id}", response_model=AlumnoResponse)
async def obtener_alumno(
    alumno_id: str,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_docente_o_admin),
):
    row = await conn.fetchrow(
        """SELECT a.id, a.no_control, a.curp, a.nombre, a.apellido_pat, a.apellido_mat,
                  a.email, COALESCE(a.semestre_actual, 0) AS semestre,
                  a.fecha_nacimiento::TEXT AS fecha_nacimiento,
                  a.activo, a.usuario_id, a.plan_estudio_id, pe.nombre AS plan_nombre, pe.carrera_id
           FROM academ.alumno a
           LEFT JOIN academ.plan_estudio pe ON pe.id = a.plan_estudio_id
           WHERE a.id=$1""",
        alumno_id,
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": f"Alumno {alumno_id} no existe."})
    return dict(row)


@router.patch("/{alumno_id}", response_model=AlumnoResponse)
async def actualizar_alumno(
    alumno_id: str,
    body: AlumnoUpdate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    row = await conn.fetchrow(
        """
        UPDATE academ.alumno
        SET nombre           = COALESCE($2, nombre),
            apellido_pat     = COALESCE($3, apellido_pat),
            apellido_mat     = COALESCE($4, apellido_mat),
            activo           = COALESCE($5, activo),
            curp             = COALESCE($6, curp),
            semestre_actual  = COALESCE($7, semestre_actual),
            fecha_nacimiento = COALESCE($8::text::date, fecha_nacimiento),
            plan_estudio_id  = COALESCE($9, plan_estudio_id)
        WHERE id = $1
        RETURNING id, no_control, curp, nombre, apellido_pat, apellido_mat,
                  email, COALESCE(semestre_actual, 0) AS semestre,
                  fecha_nacimiento::TEXT AS fecha_nacimiento,
                  activo, usuario_id, plan_estudio_id
        """,
        alumno_id, body.nombre, body.apellido_pat,
        body.apellido_mat, body.activo, body.curp,
        body.semestre, body.fecha_nacimiento, body.plan_estudio_id,
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": f"Alumno {alumno_id} no existe."})
    return dict(row)

@router.get("/{alumno_id}/analytics")
async def obtener_analytics_alumno(
    alumno_id: str,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_docente_o_admin)
):
    stats = await conn.fetchrow(
        """SELECT
            ROUND(AVG(rm.resultado_final)::numeric, 2) as promedio_general,
            COUNT(rm.id) as total_materias,
            COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70) as total_aprobadas
        FROM academ.inscripcion i
        JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
        WHERE i.alumno_id = $1""",
        alumno_id
    )
    
    historial = await conn.fetch(
        """SELECT
            p.codigo as periodo,
            ROUND(AVG(rm.resultado_final)::numeric, 2) as promedio,
            COUNT(rm.id) as materias,
            COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70) as aprobadas
        FROM academ.inscripcion i
        JOIN academ.grupo g ON g.id = i.grupo_id
        JOIN academ.periodo_academico p ON p.id = g.periodo_id
        JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
        WHERE i.alumno_id = $1
        GROUP BY p.id, p.codigo
        ORDER BY p.id ASC""",
        alumno_id
    )
    
    return {
        "stats": {
            "promedio_general": float(stats["promedio_general"] or 0),
            "total_materias": stats["total_materias"] or 0,
            "total_aprobadas": stats["total_aprobadas"] or 0
        },
        "historial": [dict(h) for h in historial]
    }

@router.get("/{alumno_id}/kardex")
async def obtener_kardex_alumno(
    alumno_id: str,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin)
):
    """
    Exclusivo para admin: devuelve los grupos del alumno
    con la estructura necesaria para renderizar su Kárdex.
    """
    rows = await conn.fetch(
        """
        SELECT i.alumno_id, g.id AS grupo_id, g.nombre, g.estado, g.calificacion_maxima,
               m.nombre AS materia, i.id AS inscripcion_id, i.estado AS estado_inscripcion, g.periodo_id, d.nombre || ' ' || d.apellido_pat AS docente,
               calc.resultado_final, calc.unidades_con_result 
        FROM academ.inscripcion i 
        JOIN academ.grupo g ON g.id = i.grupo_id
        JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
        JOIN academ.materia m ON m.id = pm.materia_id
        LEFT JOIN academ.docente d ON d.id = g.docente_id
        LEFT JOIN LATERAL academ.fn_calcular_resultado_materia(i.id) calc ON true 
        WHERE i.alumno_id = $1 AND i.estado = 'ACTIVA'
        """,
        alumno_id,
    )
    return [dict(r) for r in rows]

@router.get("/{alumno_id}/kardex-detallado")
async def obtener_kardex_detallado(
    alumno_id: str,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin)
):
    """
    Admin: devuelve el Kardex consolidado de todas las inscripciones del alumno.
    """
    rows = await conn.fetch(
        """
        SELECT i.id AS inscripcion_id, g.id AS grupo_id, g.nombre, g.calificacion_maxima,
               m.nombre AS materia, p.id AS periodo_id, p.codigo AS periodo_codigo, p.nombre AS periodo_nombre,
               d.nombre || ' ' || d.apellido_pat AS docente,
               (SELECT AVG(ru.resultado_final) 
                FROM academ.resultado_unidad ru 
                WHERE ru.inscripcion_id = i.id AND ru.resultado_final IS NOT NULL
               ) AS resultado_final
        FROM academ.inscripcion i
        JOIN academ.grupo g ON g.id = i.grupo_id
        JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
        JOIN academ.materia m ON m.id = pm.materia_id
        JOIN academ.periodo_academico p ON p.id = g.periodo_id
        LEFT JOIN academ.docente d ON d.id = g.docente_id
        WHERE i.alumno_id = $1
        ORDER BY p.fecha_inicio DESC
        """,
        alumno_id,
    )
    return [dict(r) for r in rows]
