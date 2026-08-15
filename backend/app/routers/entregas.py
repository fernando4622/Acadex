"""
Router de Entregas de Actividades — subida de archivos con versionado.
El alumno sube archivos, el servidor valida fechas, calcula SHA-256 y almacena.
"""
import os
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from asyncpg import Connection
from uuid import UUID

from app.database import get_conn
from app.middleware.auth import get_current_user, is_alumno, is_docente, is_admin

router = APIRouter(prefix="/entregas", tags=["Entregas"])

UPLOAD_BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
ALLOWED_EXT = {"pdf", "docx", "pptx", "xls", "xlsx", "ppt", "doc"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


@router.post("/{actividad_id}")
async def subir_entrega(
    actividad_id: int,
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """
    Alumno sube un archivo para una actividad. Validación de fechas en servidor.
    Crea nueva versión si ya existe una entrega previa.
    """
    if not is_alumno(user):
        raise HTTPException(403, detail={"codigo": "SOLO_ALUMNO", "mensaje": "Solo alumnos pueden subir entregas."})

    alumno_id = user["id_entidad"]

    # Validar extensión
    nombre_original = archivo.filename or "archivo"
    ext = nombre_original.rsplit(".", 1)[-1].lower() if "." in nombre_original else ""
    if ext not in ALLOWED_EXT:
        raise HTTPException(422, detail={
            "codigo": "EXTENSION_NO_PERMITIDA",
            "mensaje": f"Extensión '{ext}' no permitida. Permitidas: {', '.join(sorted(ALLOWED_EXT))}"
        })

    # Obtener contexto de la actividad
    act = await conn.fetchrow(
        """SELECT a.id, a.fecha_apertura, a.fecha_cierre, a.activa,
                  u.grupo_id, g.periodo_id, p.codigo AS periodo_codigo
           FROM academ.actividad a
           JOIN academ.unidad u ON u.id = a.unidad_id
           JOIN academ.grupo g ON g.id = u.grupo_id
           JOIN academ.periodo_academico p ON p.id = g.periodo_id
           WHERE a.id = $1""",
        actividad_id,
    )
    if not act:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Actividad no encontrada."})
    if not act["activa"]:
        raise HTTPException(400, detail={"codigo": "INACTIVA", "mensaje": "La actividad está inactiva."})

    # Validar inscripción activa
    inscripcion = await conn.fetchrow(
        "SELECT id FROM academ.inscripcion WHERE alumno_id=$1 AND grupo_id=$2 AND estado='ACTIVA'",
        alumno_id, act["grupo_id"],
    )
    if not inscripcion:
        raise HTTPException(403, detail={"codigo": "NO_INSCRITO", "mensaje": "No estás inscrito en el grupo de esta actividad."})

    # Validar fechas en SERVIDOR (timestamp del backend, no del navegador)
    ahora = datetime.now(timezone.utc)

    if act["fecha_apertura"] and ahora < act["fecha_apertura"]:
        raise HTTPException(400, detail={
            "codigo": "ANTES_APERTURA",
            "mensaje": "La actividad aún no está abierta para entregas."
        })
    if act["fecha_cierre"] and ahora > act["fecha_cierre"]:
        raise HTTPException(400, detail={
            "codigo": "DESPUES_CIERRE",
            "mensaje": "La fecha de cierre ha pasado. No se aceptan más entregas."
        })

    # Leer archivo y calcular hash
    contenido = await archivo.read()
    if len(contenido) > MAX_FILE_SIZE:
        raise HTTPException(413, detail={"codigo": "ARCHIVO_MUY_GRANDE", "mensaje": "El archivo excede el límite de 20 MB."})

    hash_sha256 = hashlib.sha256(contenido).hexdigest()

    # Obtener el numero de control vigente del alumno.
    num_control = await conn.fetchval(
        "SELECT no_control FROM academ.alumno WHERE id=$1", alumno_id
    )

    # Calcular versión
    version_actual = await conn.fetchval(
        """SELECT COALESCE(MAX(version), 0)
           FROM academ.entrega_actividad
           WHERE inscripcion_id=$1 AND actividad_id=$2""",
        inscripcion["id"], actividad_id,
    ) or 0
    nueva_version = version_actual + 1

    # Construir ruta de almacenamiento
    ts_unix = int(ahora.timestamp())
    relative_path = os.path.join(
        act["periodo_codigo"],
        str(act["grupo_id"]),
        str(actividad_id),
        f"{num_control}_{ts_unix}.{ext}"
    )
    full_path = os.path.join(UPLOAD_BASE, relative_path)

    # Crear directorios
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    # Guardar archivo
    with open(full_path, "wb") as f:
        f.write(contenido)

    # Registrar en BD
    async with conn.transaction():
        row = await conn.fetchrow(
            """INSERT INTO academ.entrega_actividad
                   (inscripcion_id, actividad_id, version, ruta_archivo,
                    nombre_original, extension, hash_sha256, tamanio_bytes, ts_servidor)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING id, version, ts_servidor, hash_sha256""",
            inscripcion["id"], actividad_id, nueva_version, relative_path,
            nombre_original, ext, hash_sha256, len(contenido), ahora,
        )

        # Actualizar estado en resultado_actividad (vista para alumno y docente)
        # Si ya existe, solo cambiamos el estado si no es 'EXENTO'.
        # Si no existe, lo creamos con calificacion NULL y registrado_por NULL.
        await conn.execute(
            """INSERT INTO academ.resultado_actividad 
                   (inscripcion_id, actividad_id, estado_entrega, registrado_por, fecha_registro)
               VALUES ($1, $2, 'ENTREGADA', NULL, $3)
               ON CONFLICT (inscripcion_id, actividad_id) 
               DO UPDATE SET 
                  estado_entrega = CASE 
                    WHEN academ.resultado_actividad.estado_entrega = 'EXENTO' THEN 'EXENTO'
                    ELSE 'ENTREGADA'
                  END,
                  fecha_modificacion = $3
               WHERE academ.resultado_actividad.estado_entrega IS DISTINCT FROM 'EXENTO'""",
            inscripcion["id"], actividad_id, ahora
        )

    return {
        "mensaje": f"Entrega recibida correctamente (versión {nueva_version}).",
        "entrega_id": row["id"],
        "version": row["version"],
        "hash_sha256": row["hash_sha256"],
        "ts_servidor": row["ts_servidor"].isoformat(),
    }


@router.get("/descargar/{entrega_id}")
async def descargar_entrega(
    entrega_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """Descarga un archivo de entrega."""
    row = await conn.fetchrow(
        """SELECT ea.ruta_archivo, ea.nombre_original, ea.inscripcion_id, 
                  i.alumno_id, u.grupo_id, g.docente_id
           FROM academ.entrega_actividad ea
           JOIN academ.inscripcion i ON i.id = ea.inscripcion_id
           JOIN academ.actividad a ON a.id = ea.actividad_id
           JOIN academ.unidad u ON u.id = a.unidad_id
           JOIN academ.grupo g ON g.id = u.grupo_id
           WHERE ea.id = $1""",
        entrega_id
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Entrega no encontrada."})

    # Seguridad: Solo el propio alumno, el docente del grupo o un admin
    es_admin_val = is_admin(user)
    es_propietario = is_alumno(user) and str(user.get("id_entidad")) == str(row["alumno_id"])
    es_docente_grupo = is_docente(user) and str(user.get("id_entidad")) == str(row["docente_id"])

    if not (es_admin_val or es_propietario or es_docente_grupo):
         raise HTTPException(403, detail={"codigo": "SIN_PERMISO", "mensaje": "No tienes permiso para descargar esta entrega."})

    full_path = os.path.join(UPLOAD_BASE, row["ruta_archivo"])
    if not os.path.exists(full_path):
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "El archivo físico no existe en el servidor."})

    from fastapi.responses import FileResponse
    return FileResponse(full_path, filename=row["nombre_original"])


@router.get("/{actividad_id}/mis-entregas")
async def mis_entregas(
    actividad_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """Historial de entregas del alumno para una actividad."""
    if not is_alumno(user):
        raise HTTPException(403, detail={"codigo": "SOLO_ALUMNO", "mensaje": "Solo alumnos."})

    alumno_id = user["id_entidad"]
    inscripcion_id = await conn.fetchval(
        """SELECT i.id FROM academ.inscripcion i
           JOIN academ.actividad a ON TRUE
           JOIN academ.unidad u ON u.id = a.unidad_id AND u.grupo_id = i.grupo_id
           WHERE i.alumno_id=$1 AND a.id=$2 AND i.estado='ACTIVA'""",
        alumno_id, actividad_id,
    )
    if not inscripcion_id:
        raise HTTPException(403, detail={"codigo": "NO_INSCRITO", "mensaje": "No inscrito."})

    rows = await conn.fetch(
        """SELECT id, version, nombre_original, extension, tamanio_bytes,
                  hash_sha256, ts_servidor
           FROM academ.entrega_actividad
           WHERE inscripcion_id=$1 AND actividad_id=$2
           ORDER BY version DESC""",
        inscripcion_id, actividad_id,
    )
    return [dict(r) for r in rows]


@router.get("/{actividad_id}/alumno/{inscripcion_id}")
async def entregas_alumno(
    actividad_id: int,
    inscripcion_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """Docente o Admin consulta las entregas de un alumno específico."""
    if not (is_docente(user) or is_admin(user)):
        raise HTTPException(403, detail={"codigo": "NO_AUTORIZADO", "mensaje": "Solo docentes o admins."})

    rows = await conn.fetch(
        """SELECT ea.id, ea.version, ea.nombre_original, ea.extension,
                  ea.tamanio_bytes, ea.hash_sha256, ea.ts_servidor,
                  a.nombre || ' ' || a.apellido_pat || COALESCE(' ' || a.apellido_mat, '') AS alumno
           FROM academ.entrega_actividad ea
           JOIN academ.inscripcion i ON i.id = ea.inscripcion_id
           JOIN academ.alumno a ON a.id = i.alumno_id
           WHERE ea.inscripcion_id=$1 AND ea.actividad_id=$2
           ORDER BY ea.version DESC""",
        inscripcion_id, actividad_id,
    )
    return [dict(r) for r in rows]


@router.get("/{actividad_id}/resumen")
async def resumen_entregas(
    actividad_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """Resumen de entregas: cuántos alumnos entregaron vs total inscritos."""
    if not (is_docente(user) or is_admin(user)):
        raise HTTPException(403, detail={"codigo": "NO_AUTORIZADO", "mensaje": "Solo docentes o admins."})

    row = await conn.fetchrow(
        """SELECT
               COUNT(DISTINCT i.id) AS total_inscritos,
               COUNT(DISTINCT ea.inscripcion_id) AS total_entregados
           FROM academ.actividad a
           JOIN academ.unidad u ON u.id = a.unidad_id
           JOIN academ.inscripcion i ON i.grupo_id = u.grupo_id AND i.estado = 'ACTIVA'
           LEFT JOIN academ.entrega_actividad ea
               ON ea.inscripcion_id = i.id AND ea.actividad_id = a.id
           WHERE a.id = $1""",
        actividad_id,
    )
    return dict(row)
