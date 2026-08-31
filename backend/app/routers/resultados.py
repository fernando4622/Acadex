import logging

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection
from uuid import UUID
from app.database import get_conn
from app.auth.authorization import (
    assert_can_read_enrollment_unit,
    assert_can_read_group_results,
)
from app.middleware.auth import get_current_user, require_docente_o_admin

router = APIRouter(tags=["Resultados"])
logger = logging.getLogger(__name__)


@router.get("/grupos/{grupo_id}/resultados")
async def resultados_del_grupo(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    await assert_can_read_group_results(conn, user, grupo_id)
    rows = await conn.fetch(
        """SELECT alumno,no_control,inscripcion_id,promedio_base,bonus_materia,justificacion,
                  resultado_calculado,resultado_override,resultado_final,estatus,
                  justificacion_override,fecha_calculo
           FROM academ.v_resultados_finales
           WHERE grupo_id=$1 ORDER BY alumno""",
        grupo_id,
    )
    return [dict(r) for r in rows]


@router.get("/grupos/{grupo_id}/resultados/estadisticas")
async def estadisticas_grupo(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    await assert_can_read_group_results(conn, user, grupo_id)
    
    # Verificar si hay al menos una unidad evaluada (CERRADA o PRE_CIERRE)
    has_evals = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM academ.unidad WHERE grupo_id=$1 AND estado != 'EDICION')",
        grupo_id
    )

    grupo_estado = await conn.fetchval("SELECT estado FROM academ.grupo WHERE id=$1", grupo_id)
    if grupo_estado == 'FINALIZADO':
        row = await conn.fetchrow(
            """SELECT COUNT(*)                                     AS total_alumnos,
                      ROUND(AVG(resultado_final)::NUMERIC,2)      AS promedio_grupo,
                      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY resultado_final)::float AS mediana,
                      STDDEV(resultado_final)::float               AS desviacion_estandar,
                      ROUND(MAX(resultado_final)::NUMERIC,2)      AS calificacion_max,
                      ROUND(MIN(resultado_final)::NUMERIC,2)      AS calificacion_min,
                      COUNT(*) FILTER(WHERE estatus='APROBADO')   AS aprobados,
                      COUNT(*) FILTER(WHERE estatus='REPROBADO')  AS reprobados,
                      COUNT(*) FILTER(WHERE estatus='PENDIENTE')  AS pendientes
               FROM academ.v_resultados_finales WHERE grupo_id=$1""",
            grupo_id,
        )
    else:
        row = await conn.fetchrow(
            """WITH dinamicos AS (
                  SELECT (academ.fn_calcular_resultado_materia(i.id)).resultado_final AS rf
                  FROM academ.inscripcion i
                  WHERE i.grupo_id = $1 AND i.estado = 'ACTIVA'
               )
               SELECT COUNT(*) AS total_alumnos,
                      ROUND(AVG(rf)::NUMERIC,2) AS promedio_grupo,
                      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rf)::float AS mediana,
                      STDDEV(rf)::float AS desviacion_estandar,
                      ROUND(MAX(rf)::NUMERIC,2) AS calificacion_max,
                      ROUND(MIN(rf)::NUMERIC,2) AS calificacion_min,
                      COUNT(*) FILTER(WHERE rf >= 70) AS aprobados,
                      COUNT(*) FILTER(WHERE rf < 70) AS reprobados,
                      0 AS pendientes
               FROM dinamicos""",
            grupo_id
        )
    
    res = dict(row)
    # Si no hay evaluaciones, forzamos a null para que el frontend muestre "--"
    if not has_evals:
        res['promedio_grupo'] = None
        res['aprobados'] = None
        res['reprobados'] = None
        
    return res


@router.get("/grupos/{grupo_id}/resultados/unidades")
async def resultados_por_unidad(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    await assert_can_read_group_results(conn, user, grupo_id)
    rows = await conn.fetch(
        """SELECT vp.no_control,vp.alumno,vp.inscripcion_id,
                  vp.unidad_id,vp.unidad_numero,vp.unidad_nombre,vp.unidad_estado,
                  COALESCE(vp.resultado_persistido,vp.resultado_estimado) AS resultado,
                  vp.bonus_unidad, vp.justificacion, vp.promedio_parcial,
                  vp.total_actividades, vp.actividades_con_resultado
           FROM academ.v_resultados_parciales vp
           WHERE vp.grupo_id=$1 ORDER BY vp.alumno, vp.unidad_numero""",
        grupo_id,
    )
    return [dict(r) for r in rows]





@router.get("/inscripciones/{inscripcion_id}/resultado-dinamico/{unidad_id}")
async def resultado_dinamico(
    inscripcion_id: UUID,
    unidad_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    await assert_can_read_enrollment_unit(
        conn,
        user,
        inscripcion_id,
        unidad_id,
        allow_student_owner=True,
    )
    try:
        row = await conn.fetchrow(
            "SELECT * FROM academ.fn_calcular_resultado_unidad($1,$2)",
            inscripcion_id, unidad_id,
        )
        if not row:
            return {"inscripcion_id": inscripcion_id, "unidad_id": unidad_id, "promedio_base": None, "bonus_aplicado": 0, "resultado_final": 0, "desglose": []}
            
        def to_float(val):
            return float(val) if val is not None else None

        return {
            "inscripcion_id":  inscripcion_id,
            "unidad_id":       unidad_id,
            "promedio_base":   to_float(row["promedio_base"]),
            "bonus_aplicado":  to_float(row["bonus_aplicado"]),
            "resultado_final": to_float(row["resultado_final"]),
            "desglose":        row["desglose"],
        }
    except Exception as exc:
        logger.error(
            "Dynamic unit result failed: unit_id=%s error_type=%s",
            unidad_id,
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail={
                "codigo": "ERROR_INTERNO",
                "mensaje": "No se pudo calcular el resultado de la unidad.",
            },
        )


@router.get("/inscripciones/{inscripcion_id}/actividades/{unidad_id}")
async def obtener_detalle_actividades(
    inscripcion_id: UUID,
    unidad_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin)
):
    await assert_can_read_enrollment_unit(
        conn,
        user,
        inscripcion_id,
        unidad_id,
        allow_student_owner=False,
    )
    resultado_final = await conn.fetchval(
        """SELECT COALESCE(SUM(ra.calificacion * (a.ponderacion / 100.0)), 0)
           FROM academ.resultado_actividad ra
           JOIN academ.actividad a ON a.id = ra.actividad_id
           WHERE ra.inscripcion_id = $1 AND a.unidad_id = $2 AND a.activa = TRUE""",
        inscripcion_id, unidad_id
    )

    actividades = await conn.fetch(
        """SELECT a.descripcion, c.nombre as tipo_nombre, a.ponderacion as valor_maximo,
                  ra.calificacion
           FROM academ.actividad a
           LEFT JOIN academ.tipo_actividad_catalogo c ON a.tipo_catalogo_id = c.id
           LEFT JOIN academ.resultado_actividad ra ON ra.actividad_id = a.id AND ra.inscripcion_id = $1
           WHERE a.unidad_id = $2 AND a.activa = TRUE
           ORDER BY a.ponderacion DESC""",
        inscripcion_id, unidad_id
    )
    return {
        "resultado_final": float(resultado_final),
        "actividades": [dict(a) for a in actividades]
    }
