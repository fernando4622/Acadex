import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection
from uuid import UUID
from app.database import get_conn
from app.middleware.auth import is_admin, is_docente, is_alumno, require_docente_o_admin, assert_docente_en_grupo
from app.schemas.bonus import BonusUnidadRequest, BonusMateriaRequest, OverrideRequest
from app.errors import handle_pg_error

router = APIRouter(prefix="/grupos/{grupo_id}", tags=["Bonus y Override"])


@router.post("/bonus/unidad")
async def aplicar_bonus_unidad(
    grupo_id: UUID,
    body: BonusUnidadRequest,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    assert_docente_en_grupo(user, grupo_id)
    docente_id = user.get("id_entidad")
    if is_admin(user) or not docente_id:
        docente_id = await conn.fetchval("SELECT docente_id FROM academ.grupo WHERE id=$1", grupo_id)
    # 1. Obtener datos de la unidad y estado de unidades previas
    info = await conn.fetchrow("""
        SELECT u.numero, u.estado as estado_unidad, g.estado as estado_grupo
        FROM academ.unidad u
        JOIN academ.grupo g ON g.id = u.grupo_id
        WHERE u.id = $1
    """, body.unidad_id)
    
    if not info:
        raise HTTPException(404, detail={"codigo":"NO_ENCONTRADO","mensaje":"Unidad no encontrada."})
    
    if info["estado_unidad"] != "EDICION":
        raise HTTPException(409, detail={"codigo":"UNIDAD_CERRADA","mensaje":"El bonus solo se puede aplicar mientras la unidad esté abierta (EDICION)."})

    if info["estado_grupo"] == "FINALIZADO":
        raise HTTPException(409, detail={"codigo":"GRUPO_FINALIZADO","mensaje":"La materia ya está FINALIZADA."})

    # 2. Validar que las unidades previas estén cerradas
    previa_abierta = await conn.fetchval("""
        SELECT COUNT(*) FROM academ.unidad 
        WHERE grupo_id = $1 AND numero < $2 AND estado = 'EDICION'
    """, grupo_id, info["numero"])
    
    if previa_abierta > 0:
        raise HTTPException(409, detail={"codigo":"ORDEN_REQUERIDO","mensaje":"Debe cerrar las unidades anteriores antes de aplicar bonus a esta unidad."})

    # 3. Validar que existan actividades y captura COMPLETA PARA ESTE ALUMNO (100% calificado)
    stats_captura = await conn.fetchrow("""
        SELECT COUNT(a.id) as total,
               COUNT(ra.id) as calificados
        FROM academ.actividad a
        LEFT JOIN academ.resultado_actividad ra ON ra.actividad_id = a.id AND ra.inscripcion_id = $1
        WHERE a.unidad_id = $2 AND a.activa = TRUE
    """, body.inscripcion_id, body.unidad_id)

    if stats_captura["total"] == 0:
        raise HTTPException(409, detail={"codigo":"SIN_ACTIVIDADES","mensaje":"No se puede aplicar bonus a una unidad sin actividades."})
    
    if stats_captura["calificados"] < stats_captura["total"]:
        raise HTTPException(409, detail={"codigo":"CAPTURA_INCOMPLETA","mensaje":"Este alumno aún tiene actividades sin calificar en esta unidad."})

    await conn.execute(
        "SELECT set_config('app.usuario_id',$1,TRUE), set_config('app.motivo',$2,TRUE)",
        user["sub"], body.justificacion or "",
    )
    antes = await conn.fetchval(
        "SELECT resultado_final FROM academ.resultado_unidad WHERE inscripcion_id=$1 AND unidad_id=$2",
        body.inscripcion_id, body.unidad_id,
    )
    try:
        await conn.execute(
            "CALL academ.sp_aplicar_bonus_unidad($1,$2,$3,$4,$5)",
            body.inscripcion_id, body.unidad_id, body.monto, body.justificacion, docente_id,
        )
    except asyncpg.PostgresError as e:
        raise handle_pg_error(e)
    despues = await conn.fetchrow(
        "SELECT promedio_base,bonus_aplicado,resultado_final FROM academ.resultado_unidad WHERE inscripcion_id=$1 AND unidad_id=$2",
        body.inscripcion_id, body.unidad_id,
    )
    return {
        "mensaje":         "Bonus aplicado.",
        "resultado_antes": float(antes) if antes else None,
        "promedio_base":   float(despues["promedio_base"]) if despues else None,
        "bonus_aplicado":  float(despues["bonus_aplicado"]) if despues else body.monto,
        "resultado_final": float(despues["resultado_final"]) if despues else None,
    }


@router.post("/bonus/materia")
async def aplicar_bonus_materia(
    grupo_id: UUID,
    body: BonusMateriaRequest,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    print(f"DEBUG: aplicando bonus materia para grupo {grupo_id}")
    assert_docente_en_grupo(user, grupo_id)
    docente_id = user.get("id_entidad")
    if is_admin(user) or not docente_id:
        docente_id = await conn.fetchval("SELECT docente_id FROM academ.grupo WHERE id=$1", grupo_id)
    
    await conn.execute(
        "SELECT set_config('app.usuario_id',$1,TRUE), set_config('app.motivo',$2,TRUE)",
        user["sub"], body.justificacion or "",
    )

    val_antes = await conn.fetchval(
        "SELECT resultado_final FROM academ.resultado_materia WHERE inscripcion_id=$1",
        body.inscripcion_id
    )

    try:
        await conn.execute(
            """INSERT INTO academ.bonus_materia (inscripcion_id,monto,justificacion,aplicado_por)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT (inscripcion_id) DO UPDATE
               SET monto=$2,justificacion=$3,aplicado_por=$4,fecha_aplicacion=NOW()""",
            body.inscripcion_id, body.monto, body.justificacion, docente_id,
        )
    except asyncpg.PostgresError as e:
        raise handle_pg_error(e)

    despues = await conn.fetchrow(
        "SELECT bonus_aplicado,resultado_calculado,resultado_final FROM academ.resultado_materia WHERE inscripcion_id=$1",
        body.inscripcion_id,
    )

    return {
        "mensaje":             "Bonus de materia aplicado.",
        "resultado_antes":     float(val_antes) if val_antes is not None else None,
        "bonus_aplicado":      float(despues["bonus_aplicado"]) if despues else body.monto,
        "resultado_calculado": float(despues["resultado_calculado"]) if despues else None,
        "resultado_final":     float(despues["resultado_final"]) if despues else None,
    }


@router.post("/override")
async def override_resultado(
    grupo_id: UUID,
    body: OverrideRequest,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    assert_docente_en_grupo(user, grupo_id)
    docente_id = user.get("id_entidad")
    if is_admin(user) or not docente_id:
        docente_id = await conn.fetchval("SELECT docente_id FROM academ.grupo WHERE id=$1", grupo_id)
    antes = await conn.fetchrow(
        "SELECT resultado_calculado,resultado_final FROM academ.resultado_materia WHERE inscripcion_id=$1",
        body.inscripcion_id,
    )
    await conn.execute(
        "SELECT set_config('app.usuario_id',$1,TRUE), set_config('app.motivo',$2,TRUE)",
        user["sub"], body.justificacion or "",
    )
    try:
        await conn.execute(
            "CALL academ.sp_override_resultado_materia($1,$2,$3,$4)",
            body.inscripcion_id, body.resultado_override, body.justificacion, docente_id,
        )
    except asyncpg.PostgresError as e:
        raise handle_pg_error(e)
    return {
        "mensaje":             "Override aplicado.",
        "resultado_calculado": float(antes["resultado_calculado"]) if antes else None,
        "resultado_anterior":  float(antes["resultado_final"]) if antes else None,
        "resultado_override":  body.resultado_override,
    }
