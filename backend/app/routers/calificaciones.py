import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection
from app.database import get_conn
from app.middleware.auth import is_admin, is_docente, is_alumno, require_docente_o_admin, get_current_user, assert_docente_en_grupo
from app.schemas.calificacion import CalificacionCreate, CalificacionBulkRequest
from app.errors import handle_pg_error

router = APIRouter(tags=["Calificaciones"])


async def _get_grupo_de_actividad(conn: Connection, actividad_id: int):
    return await conn.fetchval(
        "SELECT u.grupo_id FROM academ.actividad a JOIN academ.unidad u ON u.id=a.unidad_id WHERE a.id=$1",
        actividad_id,
    )


@router.get("/actividades/{actividad_id}/calificaciones")
async def listar_calificaciones(
    actividad_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_docente_o_admin),
):
    rows = await conn.fetch(
        """SELECT i.id AS inscripcion_id, a.no_control AS matricula,
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
    grupo_id = await _get_grupo_de_actividad(conn, actividad_id)
    if not grupo_id:
        raise HTTPException(404, detail={"codigo":"NO_ENCONTRADO","mensaje":"Actividad no encontrada."})
    
    # Validar estado de la unidad
    unidad_info = await conn.fetchrow("""
        SELECT u.estado 
        FROM academ.actividad a
        JOIN academ.unidad u ON u.id = a.unidad_id
        WHERE a.id = $1""", actividad_id)
        
    if not unidad_info or unidad_info['estado'] != 'EDICION':
        raise HTTPException(409, detail={"codigo": "UNIDAD_BLOQUEADA", "mensaje": "No se pueden registrar calificaciones en una unidad que no está en estado EDICION."})

    assert_docente_en_grupo(user, grupo_id)
    docente_id = user.get("id_entidad")
    if is_admin(user) or not docente_id:
        docente_id = await conn.fetchval("SELECT docente_id FROM academ.grupo WHERE id=$1", grupo_id)
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
    grupo_id = await _get_grupo_de_actividad(conn, actividad_id)
    if not grupo_id:
        raise HTTPException(404, detail={"codigo":"NO_ENCONTRADO","mensaje":"Actividad no encontrada."})
    
    # Validar estado de la unidad
    unidad_info = await conn.fetchrow("""
        SELECT u.estado 
        FROM academ.actividad a
        JOIN academ.unidad u ON u.id = a.unidad_id
        WHERE a.id = $1""", actividad_id)
        
    if not unidad_info or unidad_info['estado'] != 'EDICION':
        raise HTTPException(409, detail={"codigo": "UNIDAD_BLOQUEADA", "mensaje": "No se pueden registrar calificaciones en una unidad que no está en estado EDICION."})

    assert_docente_en_grupo(user, grupo_id)
    docente_id = user.get("id_entidad")
    if is_admin(user) or not docente_id:
        docente_id = await conn.fetchval("SELECT docente_id FROM academ.grupo WHERE id=$1", grupo_id)
    # Establecer variables de sesión UNA VEZ antes del loop — el motivo es
    # el mismo para toda la operación bulk y los triggers de auditoría las
    # leen en cada INSERT aunque el SP también las establezca internamente.
    async with conn.transaction():
        await conn.execute(
            "SELECT set_config('app.usuario_id',$1,TRUE), set_config('app.motivo',$2,TRUE)",
            user["sub"], body.motivo or "",
        )
        guardadas, errores = 0, []
        for item in body.calificaciones:
            try:
                await conn.execute(
                    "CALL academ.sp_registrar_calificacion($1,$2,$3,$4,$5,$6)",
                    item.inscripcion_id, actividad_id, item.calificacion,
                    item.estado_entrega, docente_id, body.motivo,
                )
                guardadas += 1
            except asyncpg.PostgresError as e:
                errores.append({"inscripcion_id": item.inscripcion_id, "error": str(e.args[0] if e.args else e)})
    return {"guardadas": guardadas, "errores": errores, "total": len(body.calificaciones)}


@router.get("/unidades/{unidad_id}/captura-pendiente")
async def captura_pendiente(
    unidad_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_docente_o_admin),
):
    rows = await conn.fetch(
        "SELECT * FROM academ.v_captura_pendiente WHERE unidad_id=$1 ORDER BY actividad_id, alumno",
        unidad_id,
    )
    total      = len(rows)
    pendientes = sum(1 for r in rows if r["pendiente"])
    return {
        "unidad_id":  unidad_id,
        "total":      total,
        "pendientes": pendientes,
        "completado": round((total - pendientes) / total * 100, 1) if total > 0 else 0,
        "detalle":    [dict(r) for r in rows],
    }