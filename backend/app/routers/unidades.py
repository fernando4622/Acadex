import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection
from uuid import UUID
from app.database import get_conn
from app.middleware.auth import require_docente_o_admin, get_current_user
from app.auth.authorization import assert_can_manage_group, assert_can_read_group_content
from app.schemas.unidad import UnidadCreate, UnidadResponse, CerrarUnidadRequest
from app.errors import handle_pg_error

router = APIRouter(tags=["Unidades"])


@router.get("/grupos/{grupo_id}/unidades", response_model=list[UnidadResponse])
async def listar_unidades(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    await assert_can_read_group_content(conn, user, grupo_id)
    rows = await conn.fetch(
        """SELECT u.id, u.grupo_id, u.numero, u.nombre, u.estado, u.fecha_cierre,
                  v.suma_ponderaciones, v.estructura_completa
           FROM academ.unidad u
           LEFT JOIN academ.v_suma_ponderaciones v ON v.unidad_id=u.id
           WHERE u.grupo_id=$1 ORDER BY u.numero""",
        grupo_id,
    )
    return [dict(r) for r in rows]




@router.post("/unidades/{unidad_id}/cerrar")
async def cerrar_unidad(
    unidad_id: int,
    body: CerrarUnidadRequest,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    grupo_id = await conn.fetchval("SELECT grupo_id FROM academ.unidad WHERE id=$1", unidad_id)
    if not grupo_id:
        raise HTTPException(404, detail={"codigo":"NO_ENCONTRADO","mensaje":"Unidad no encontrada."})
    docente_id = await assert_can_manage_group(conn, user, grupo_id)

    # Validar que no existan unidades anteriores abiertas
    unidad_actual = await conn.fetchrow("SELECT numero FROM academ.unidad WHERE id=$1", unidad_id)
    if unidad_actual:
        unidad_anterior_abierta = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM academ.unidad WHERE grupo_id=$1 AND numero < $2 AND estado = 'EDICION')",
            grupo_id, unidad_actual['numero']
        )
        if unidad_anterior_abierta:
            raise HTTPException(409, detail={"codigo": "UNIDAD_ANTERIOR_ABIERTA", "mensaje": "No se puede cerrar esta unidad porque existen unidades anteriores pendientes de cerrar."})

    await conn.execute(
        "SELECT set_config('app.usuario_id',$1,TRUE), set_config('app.motivo',$2,TRUE)",
        user["sub"], "Cierre de unidad",
    )
    try:
        await conn.execute("CALL academ.sp_cerrar_unidad($1,$2,$3)", unidad_id, docente_id, body.forzar_nulos)
    except asyncpg.PostgresError as e:
        raise handle_pg_error(e)
    return {"mensaje": f"Unidad {unidad_id} cerrada correctamente."}


@router.get("/unidades/{unidad_id}/captura-pendiente")
async def captura_pendiente(
    unidad_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    """
    Verifica si una unidad tiene alumnos activos sin calificación registrados
    para alguna actividad activa.
    """
    grupo_id = await conn.fetchval("SELECT grupo_id FROM academ.unidad WHERE id=$1", unidad_id)
    if not grupo_id:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Unidad no encontrada."})
    await assert_can_manage_group(conn, user, grupo_id)
    rows = await conn.fetch("SELECT * FROM academ.v_captura_pendiente WHERE unidad_id=$1", unidad_id)
    return [dict(r) for r in rows]
