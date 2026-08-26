import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection
from app.database import get_conn
from app.auth.authorization import (
    assert_can_manage_activity,
    authorize_activity_mutation,
)
from app.middleware.auth import require_docente_o_admin
from app.schemas.calificacion import CalificacionCreate, CalificacionBulkRequest
from app.services.calificaciones import guardar_calificaciones_atomicas
from app.errors import handle_pg_error

router = APIRouter(tags=["Calificaciones"])


@router.get("/actividades/{actividad_id}/calificaciones")
async def listar_calificaciones(
    actividad_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    await assert_can_manage_activity(conn, user, actividad_id)
    rows = await conn.fetch(
        """SELECT i.id AS inscripcion_id, a.no_control,
                  a.nombre||' '||a.apellido_pat||COALESCE(' '||a.apellido_mat,'') AS alumno,
                  ra.id AS resultado_id, ra.calificacion, ra.estado_entrega,
                  ra.fecha_registro, ra.fecha_modificacion,
                  (ra.id IS NULL) AS pendiente,
                  cru.resultado_final AS parcial_unidad
           FROM academ.inscripcion i
           JOIN academ.alumno a ON a.id=i.alumno_id
           LEFT JOIN academ.resultado_actividad ra ON ra.inscripcion_id=i.id AND ra.actividad_id=$1
           LEFT JOIN LATERAL academ.fn_calcular_resultado_unidad(i.id, (SELECT unidad_id FROM academ.actividad WHERE id=$1)) cru ON TRUE
           WHERE i.grupo_id=(
               SELECT u.grupo_id FROM academ.actividad ac
               JOIN academ.unidad u ON u.id=ac.unidad_id WHERE ac.id=$1
           ) AND i.estado='ACTIVA'
           ORDER BY a.apellido_pat, a.nombre""",
        actividad_id,
    )
    return [dict(r) for r in rows]





@router.post("/actividades/{actividad_id}/calificaciones", status_code=201)
async def registrar_calificacion(
    actividad_id: int,
    body: CalificacionCreate,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    _, docente_id = await authorize_activity_mutation(
        conn,
        user,
        actividad_id,
        [body.inscripcion_id],
    )

    # Validar estado de la unidad
    unidad_info = await conn.fetchrow("""
        SELECT u.estado 
        FROM academ.actividad a
        JOIN academ.unidad u ON u.id = a.unidad_id
        WHERE a.id = $1""", actividad_id)
        
    if not unidad_info or unidad_info['estado'] != 'EDICION':
        raise HTTPException(409, detail={"codigo": "UNIDAD_BLOQUEADA", "mensaje": "No se pueden registrar calificaciones en una unidad que no está en estado EDICION."})

    async with conn.transaction():
        await conn.execute(
            "SELECT set_config('app.usuario_id',$1,TRUE), set_config('app.motivo',$2,TRUE)",
            user["sub"], body.motivo or "",
        )
        try:
            await conn.execute(
                "CALL academ.sp_registrar_calificacion($1,$2,$3,$4,$5,$6)",
                body.inscripcion_id, actividad_id, body.calificacion,
                body.estado_entrega, docente_id, body.motivo,
            )
        except asyncpg.PostgresError as e:
            raise handle_pg_error(e)

    row = await conn.fetchrow(
        "SELECT id,inscripcion_id,actividad_id,calificacion,estado_entrega FROM academ.resultado_actividad WHERE inscripcion_id=$1 AND actividad_id=$2",
        body.inscripcion_id, actividad_id,
    )
    return dict(row)


@router.post("/actividades/{actividad_id}/calificaciones/bulk", status_code=201)
async def bulk_calificaciones(
    actividad_id: int,
    body: CalificacionBulkRequest,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    _, docente_id = await authorize_activity_mutation(
        conn,
        user,
        actividad_id,
        [item.inscripcion_id for item in body.calificaciones],
    )

    # Validar estado de la unidad
    unidad_info = await conn.fetchrow("""
        SELECT u.estado 
        FROM academ.actividad a
        JOIN academ.unidad u ON u.id = a.unidad_id
        WHERE a.id = $1""", actividad_id)
        
    if not unidad_info or unidad_info['estado'] != 'EDICION':
        raise HTTPException(409, detail={"codigo": "UNIDAD_BLOQUEADA", "mensaje": "No se pueden registrar calificaciones en una unidad que no está en estado EDICION."})

    guardadas = await guardar_calificaciones_atomicas(
        conn,
        actividad_id=actividad_id,
        calificaciones=body.calificaciones,
        docente_id=docente_id,
        usuario_id=user["sub"],
        motivo=body.motivo,
    )
    return {"guardadas": guardadas, "total": len(body.calificaciones)}
