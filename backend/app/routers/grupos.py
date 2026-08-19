import asyncpg
import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from asyncpg import Connection
import csv
import io
from uuid import UUID
from app.database import get_conn
from app.middleware.auth import require_admin, require_docente_o_admin, get_current_user
from app.auth.authorization import (
    assert_can_manage_group,
    assert_can_read_group_content,
    get_group_list_scope,
)
from app.schemas.grupo import GrupoCreate, GrupoResponse
from app.errors import handle_pg_error
from app.helpers.plan_materia import resolver_grupo_desde_clave_materia

router = APIRouter(prefix="/grupos", tags=["Grupos"])

DIAS_ORDEN = ["L", "M", "X", "J", "V", "S", "D"]
DIAS_LABEL = {1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 7: "Domingo"}


@router.get("", response_model=list[GrupoResponse])
async def listar_grupos(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    scope = get_group_list_scope(user)
    if scope == "ADMIN":
        rows = await conn.fetch(
            """SELECT g.id,g.nombre,g.plan_materia_id,g.docente_id,g.periodo_id,g.calificacion_maxima,g.estado,
                      g.letra_grupo,
                      m.nombre AS materia, pm.clave AS clave_materia, pm.semestre,
                      pe.nombre AS plan_nombre, c.nombre AS carrera_nombre, c.id AS carrera_id,
                      ARRAY[c.id] as carreras_ids,
                      d.nombre || ' ' || d.apellido_pat || COALESCE(' ' || d.apellido_mat, '') AS docente_nombre
               FROM academ.grupo g
               JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
               JOIN academ.materia m ON m.id = pm.materia_id
               JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
               JOIN academ.carrera c ON c.id = pe.carrera_id
               LEFT JOIN academ.docente d ON d.id = g.docente_id
               ORDER BY g.estado"""
        )
    elif scope == "DOCENTE":
        rows = await conn.fetch(
            """SELECT g.id,g.nombre,g.plan_materia_id,g.docente_id,g.periodo_id,g.calificacion_maxima,g.estado,
                      g.letra_grupo,
                      m.nombre AS materia, pm.clave AS clave_materia, pm.semestre,
                      pe.nombre AS plan_nombre, c.nombre AS carrera_nombre, c.id AS carrera_id,
                      ARRAY[c.id] as carreras_ids,
                      d.nombre || ' ' || d.apellido_pat || COALESCE(' ' || d.apellido_mat, '') AS docente_nombre
               FROM academ.grupo g
               JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
               JOIN academ.materia m ON m.id = pm.materia_id
               JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
               JOIN academ.carrera c ON c.id = pe.carrera_id
               LEFT JOIN academ.docente d ON d.id = g.docente_id
               WHERE g.docente_id=$1 ORDER BY g.estado""",
            user["id_entidad"],
        )
    else:
        rows = await conn.fetch(
            """SELECT g.id,g.nombre,g.plan_materia_id,g.docente_id,g.periodo_id,g.calificacion_maxima,g.estado,
                      g.letra_grupo,
                      m.nombre AS materia, pm.clave AS clave_materia, pm.semestre,
                      pe.nombre AS plan_nombre, c.nombre AS carrera_nombre, c.id AS carrera_id,
                      ARRAY[c.id] as carreras_ids,
                      d.nombre || ' ' || d.apellido_pat || COALESCE(' ' || d.apellido_mat, '') AS docente_nombre
               FROM academ.grupo g
               JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
               JOIN academ.materia m ON m.id = pm.materia_id
               JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
               JOIN academ.carrera c ON c.id = pe.carrera_id
               JOIN academ.inscripcion i ON i.grupo_id=g.id
               LEFT JOIN academ.docente d ON d.id = g.docente_id
               WHERE i.alumno_id=$1 AND i.estado='ACTIVA' ORDER BY g.estado""",
            user["id_entidad"],
        )
    return [dict(r) for r in rows]


@router.get("/{grupo_id}", response_model=GrupoResponse)
async def obtener_grupo(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    await assert_can_read_group_content(conn, user, grupo_id)
    row = await conn.fetchrow(
        """SELECT g.id, g.nombre, g.plan_materia_id, g.docente_id, g.periodo_id, g.calificacion_maxima, g.estado,
                  g.letra_grupo,
                  m.nombre AS materia, pm.clave AS clave_materia, pm.semestre,
                  d.nombre || ' ' || d.apellido_pat || COALESCE(' ' || d.apellido_mat, '') AS docente_nombre,
                  pa.fecha_inicio AS periodo_inicio, pa.fecha_fin AS periodo_fin
           FROM academ.grupo g
           JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
           JOIN academ.materia m ON m.id = pm.materia_id
           LEFT JOIN academ.periodo_academico pa ON pa.id = g.periodo_id
           LEFT JOIN academ.docente d ON d.id = g.docente_id
           WHERE g.id = $1""",
        grupo_id,
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": f"Grupo {grupo_id} no existe."})
    return dict(row)




@router.post("", status_code=201, response_model=GrupoResponse)
async def crear_grupo(
    body: GrupoCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    pm_info = await conn.fetchrow(
        "SELECT clave, materia_id FROM academ.plan_materia WHERE id=$1",
        body.plan_materia_id
    )
    if not pm_info:
        raise HTTPException(422, detail={"codigo": "MATERIA_INVALIDA", "mensaje": "La materia no pertenece al plan de estudios seleccionado."})

    materia_base_id = pm_info['materia_id']

    tiene_plantilla = await conn.fetchval(
        "SELECT COUNT(*) FROM academ.unidad_plantilla WHERE materia_id=$1", materia_base_id
    )
    if not tiene_plantilla:
        raise HTTPException(
            status_code=422,
            detail={
                "codigo": "SIN_PLANTILLA",
                "mensaje": "La materia seleccionada no tiene unidades definidas. Defina las unidades en Catálogos → Materias antes de crear un grupo."
            }
        )

    periodo_info = await conn.fetchrow(
        "SELECT codigo FROM academ.periodo_academico WHERE id=$1", body.periodo_id
    )
    if not periodo_info:
        raise HTTPException(422, detail={"codigo": "PERIODO_INVALIDO", "mensaje": "El periodo académico no existe."})

    letra = (body.letra_grupo or "").strip().upper()
    clave_grupo = f"{periodo_info['codigo']} {pm_info['clave']}{letra}".strip()

    try:
        row = await conn.fetchrow(
            """INSERT INTO academ.grupo
                   (nombre, plan_materia_id, docente_id, periodo_id, calificacion_maxima,
                    letra_grupo)
               VALUES ($1,$2,$3,$4,$5,$6)
               RETURNING id,nombre,plan_materia_id,docente_id,periodo_id,calificacion_maxima,estado,
                         letra_grupo""",
            clave_grupo, body.plan_materia_id, body.docente_id, body.periodo_id,
            body.calificacion_maxima, body.letra_grupo
        )
        grupo_id = row["id"]

        res = await conn.execute(
            """INSERT INTO academ.unidad (grupo_id, numero, nombre)
               SELECT $1, numero, nombre
               FROM academ.unidad_plantilla
               WHERE materia_id = $2
               ORDER BY numero""",
            grupo_id, materia_base_id,
        )
        if int(res.split()[-1]) == 0:
            raise ValueError("No se copiaron unidades")

        return dict(row)

    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=409,
            detail={
                "codigo": "GRUPO_DUPLICADO",
                "mensaje": f"Ya existe un grupo con la clave '{clave_grupo}' en este periodo académico."
            }
        )
    except asyncpg.PostgresError as e:
        raise handle_pg_error(e)


@router.get("/{grupo_id}/alumnos")
async def alumnos_del_grupo(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    await assert_can_manage_group(conn, user, grupo_id)
    try:
        rows = await conn.fetch(
            """SELECT i.id AS inscripcion_id, i.estado AS estado_inscripcion,
                      a.id AS alumno_id, a.no_control,
                      a.nombre || ' ' || a.apellido_pat || ' ' || COALESCE(a.apellido_mat, '') AS alumno
               FROM academ.inscripcion i
               JOIN academ.alumno a ON a.id=i.alumno_id
               WHERE i.grupo_id=$1 ORDER BY a.apellido_pat, a.nombre""",
            grupo_id,
        )
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"DEBUG ERROR en alumnos_del_grupo: {e}")
        raise HTTPException(500, detail={"codigo": "ERROR_INTERNO", "mensaje": str(e)})


@router.post("/{grupo_id}/finalizar")
async def finalizar_materia(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    docente_id = await assert_can_manage_group(conn, user, grupo_id)
    try:
        await conn.execute("CALL academ.sp_finalizar_materia($1,$2)", grupo_id, docente_id)
    except asyncpg.PostgresError as e:
        raise handle_pg_error(e)
    return {"mensaje": f"Materia del grupo {grupo_id} finalizada correctamente."}


@router.post("/{grupo_id}/pre-cerrar")
async def pre_cerrar_materia(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    """Transiciona el grupo de ACTIVO a PRE-CIERRE para permitir arbitraje (Bonus/Override)."""
    docente_id = await assert_can_manage_group(conn, user, grupo_id)
    try:
        await conn.execute("CALL academ.sp_pre_cerrar_materia($1, $2)", grupo_id, docente_id)
    except asyncpg.PostgresError as e:
        raise handle_pg_error(e)
    return {"mensaje": f"Grupo {grupo_id} puesto en estado PRE-CIERRE (Borrador de finalización)."}


@router.delete("/{grupo_id}", status_code=204)
async def eliminar_grupo(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    async with conn.transaction():
        # 1. Verificar si hay alumnos inscritos
        tiene_alumnos = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM academ.inscripcion WHERE grupo_id = $1)",
            grupo_id
        )
        if tiene_alumnos:
            raise HTTPException(
                status_code=409,
                detail={
                    "codigo": "GRUPO_CON_ALUMNOS",
                    "mensaje": "No se puede eliminar el grupo porque tiene alumnos inscritos. Elimine las inscripciones primero."
                }
            )

        # 2. Eliminar actividades asociadas a las unidades del grupo
        await conn.execute(
            "DELETE FROM academ.actividad WHERE unidad_id IN (SELECT id FROM academ.unidad WHERE grupo_id = $1)",
            grupo_id
        )

        # 3. Eliminar unidades del grupo
        await conn.execute("DELETE FROM academ.unidad WHERE grupo_id = $1", grupo_id)

        # 4. Eliminar el grupo
        resultado = await conn.execute("DELETE FROM academ.grupo WHERE id = $1", grupo_id)
        if resultado == "DELETE 0":
            raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "El grupo no existe."})
