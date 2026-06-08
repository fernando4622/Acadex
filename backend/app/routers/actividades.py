import asyncpg
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection
from app.database import get_conn
from app.middleware.auth import (
    require_docente_o_admin, get_current_user,
    assert_docente_en_grupo, is_alumno
)
from app.schemas.actividad import ActividadCreate, ActividadUpdate, ActividadResponse
from app.errors import handle_pg_error

router = APIRouter(tags=["Actividades"])


@router.get("/unidades/{unidad_id}/actividades", response_model=list[ActividadResponse])
async def listar_actividades(
    unidad_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    try:
        rows = await conn.fetch(
            """SELECT a.id, a.unidad_id, a.tipo_catalogo_id, c.nombre AS tipo_nombre, a.descripcion, a.ponderacion,
                      a.activa
               FROM academ.actividad a
               LEFT JOIN academ.tipo_actividad_catalogo c ON a.tipo_catalogo_id = c.id
               WHERE a.unidad_id=$1 AND a.activa=TRUE
               ORDER BY a.ponderacion DESC""",
            unidad_id,
        )

        return [dict(r) for r in rows]


    except Exception as e:
        print(f"Error en listar_actividades para unidad {unidad_id}: {e}")
        raise HTTPException(status_code=500, detail={"codigo": "ERROR_INTERNO", "mensaje": str(e)})



@router.post("/unidades/{unidad_id}/actividades", status_code=201, response_model=ActividadResponse)
async def crear_actividad(
    unidad_id: int,
    body: ActividadCreate,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    row_u = await conn.fetchrow("SELECT grupo_id, estado FROM academ.unidad WHERE id=$1", unidad_id)
    if not row_u:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Unidad no encontrada."})
    assert_docente_en_grupo(user, row_u["grupo_id"])
    if row_u["estado"] != "EDICION":
        raise HTTPException(409, detail={"codigo": "UNIDAD_BLOQUEADA",
                                         "mensaje": f"La unidad está en estado '{row_u['estado']}'. Solo se pueden añadir actividades en estado EDICION."})
    # Validación de duplicados
    existe = await conn.fetchval(
        "SELECT 1 FROM academ.actividad WHERE unidad_id=$1 AND tipo_catalogo_id=$2 AND activa=TRUE",
        unidad_id, body.tipo_catalogo_id
    )
    if existe:
        raise HTTPException(400, detail={"mensaje": "Ya existe una actividad de este tipo en esta unidad."})

    try:
        row = await conn.fetchrow(
            """INSERT INTO academ.actividad
                   (unidad_id, tipo_catalogo_id, descripcion, ponderacion)
               VALUES ($1, $2, $3, $4)
               RETURNING id, unidad_id, tipo_catalogo_id, descripcion, ponderacion, activa""",
            unidad_id, body.tipo_catalogo_id, body.descripcion, body.ponderacion,
        )

    except asyncpg.PostgresError as e:
        raise handle_pg_error(e)
    return dict(row)


@router.patch("/actividades/{actividad_id}", response_model=ActividadResponse)
async def actualizar_actividad(
    actividad_id: int,
    body: ActividadUpdate,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    row_a = await conn.fetchrow(
        """SELECT a.unidad_id, u.grupo_id, u.estado
           FROM academ.actividad a
           JOIN academ.unidad u ON u.id = a.unidad_id
           WHERE a.id = $1""",
        actividad_id,
    )
    if not row_a:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Actividad no encontrada."})
    assert_docente_en_grupo(user, row_a["grupo_id"])
    if row_a["estado"] != "EDICION":
        raise HTTPException(409, detail={"codigo": "UNIDAD_BLOQUEADA",
                                         "mensaje": "No se puede editar actividades de una unidad que no está en EDICION."})
    # Validación de duplicados
    if body.tipo_catalogo_id:
        existe = await conn.fetchval(
            "SELECT 1 FROM academ.actividad WHERE unidad_id=$1 AND tipo_catalogo_id=$2 AND activa=TRUE AND id != $3",
            row_a["unidad_id"], body.tipo_catalogo_id, actividad_id
        )
        if existe:
             raise HTTPException(400, detail={"mensaje": "Ya existe otra actividad de este tipo en esta unidad."})

    try:
        row = await conn.fetchrow(
            """UPDATE academ.actividad
               SET tipo_catalogo_id = COALESCE($2, tipo_catalogo_id),
                   descripcion    = COALESCE($3, descripcion),
                   ponderacion    = COALESCE($4, ponderacion)
               WHERE id = $1
               RETURNING id, unidad_id, tipo_catalogo_id, descripcion, ponderacion""",
            actividad_id,
            body.tipo_catalogo_id,
            body.descripcion,
            body.ponderacion,
        )
    except asyncpg.PostgresError as e:
        raise handle_pg_error(e)
    return dict(row)


@router.delete("/actividades/{actividad_id}")
async def eliminar_actividad(
    actividad_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    row_a = await conn.fetchrow(
        """SELECT a.id, u.grupo_id, u.estado,
                  EXISTS(SELECT 1 FROM academ.resultado_actividad WHERE actividad_id=a.id) AS tiene_resultados
           FROM academ.actividad a
           JOIN academ.unidad u ON u.id = a.unidad_id
           WHERE a.id=$1""",
        actividad_id,
    )
    if not row_a:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Actividad no encontrada."})
    assert_docente_en_grupo(user, row_a["grupo_id"])
    if row_a["estado"] != "EDICION":
        raise HTTPException(409, detail={"codigo": "UNIDAD_BLOQUEADA",
                                         "mensaje": "No se puede eliminar actividades de una unidad que no está en EDICION."})
    await conn.execute("UPDATE academ.actividad SET activa=FALSE WHERE id=$1", actividad_id)
    advertencia = (
        "La actividad tenía calificaciones. La suma de ponderaciones ya no es 100%. Reajuste antes de cerrar la unidad."
        if row_a["tiene_resultados"] else None
    )
    return {"mensaje": "Actividad eliminada (baja lógica).", "advertencia": advertencia}


# Endpoint especial para alumnos: actividades de su inscripción
@router.get("/mis-actividades/{inscripcion_id}")
async def mis_actividades(
    inscripcion_id: str,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """Retorna las actividades visibles para el alumno de una inscripción concreta."""
    if is_alumno(user):
        alumno_id_insc = await conn.fetchval(
            "SELECT alumno_id FROM academ.inscripcion WHERE id=$1::UUID", inscripcion_id
        )
        if str(alumno_id_insc) != str(user.get("id_entidad")):
            raise HTTPException(403, detail={"codigo": "SIN_PERMISO",
                                             "mensaje": "Solo puedes ver tus propias actividades."})
    rows = await conn.fetch(
        """SELECT actividad_id, tipo_actividad, descripcion, ponderacion,
                  unidad_id, unidad_numero, unidad_nombre, unidad_estado,
                  calificacion, estado_entrega, fecha_registro, fecha_modificacion
           FROM academ.v_actividades_alumno
           WHERE inscripcion_id=$1::UUID
           ORDER BY unidad_numero, ponderacion""",
        inscripcion_id,
    )
    return [dict(r) for r in rows]


# Publicar actividades (docente marca calificaciones como visibles para alumnos)
@router.post("/actividades/{actividad_id}/publicar")
async def publicar_actividad(
    actividad_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    """Marca una actividad como publicada. Los alumnos podrán ver sus calificaciones."""
    row_a = await conn.fetchrow(
        """SELECT a.id, u.grupo_id, a.publicada
           FROM academ.actividad a
           JOIN academ.unidad u ON u.id = a.unidad_id
           WHERE a.id = $1""",
        actividad_id,
    )
    if not row_a:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Actividad no encontrada."})
    assert_docente_en_grupo(user, row_a["grupo_id"])

    if row_a["publicada"]:
        return {"mensaje": "La actividad ya estaba publicada.", "publicada": True}

    await conn.execute(
        "UPDATE academ.actividad SET publicada=TRUE WHERE id=$1", actividad_id
    )
    return {"mensaje": "Actividad publicada. Los alumnos ahora pueden ver sus calificaciones.", "publicada": True}


@router.post("/unidades/{unidad_id}/publicar")
async def publicar_unidad(
    unidad_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    """Publica todas las actividades de una unidad de golpe."""
    row_u = await conn.fetchrow(
        "SELECT grupo_id FROM academ.unidad WHERE id=$1", unidad_id
    )
    if not row_u:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Unidad no encontrada."})
    assert_docente_en_grupo(user, row_u["grupo_id"])

    res = await conn.execute(
        "UPDATE academ.actividad SET publicada=TRUE WHERE unidad_id=$1 AND activa=TRUE",
        unidad_id,
    )
    count = int(res.split()[-1])
    return {"mensaje": f"{count} actividades publicadas en la unidad.", "publicadas": count}

