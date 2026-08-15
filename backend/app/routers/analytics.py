"""
Router de Analytics — 5 consultas analíticas para el Admin.
Todas retornan tablas ordenables (el ordenamiento se hace en frontend).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from asyncpg import Connection
from typing import Optional

from app.database import get_conn
from app.middleware.auth import require_admin, get_current_user, is_admin

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/comparativa-materias")
async def comparativa_materias(
    periodo_a: int = Query(..., description="ID del periodo A"),
    periodo_b: int = Query(..., description="ID del periodo B"),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Comparativa de promedios por materia entre dos periodos.
    Tabla: materia, promedio A, promedio B, diferencia, % reprobación A, % reprobación B,
           inscritos A, inscritos B.
    """
    rows = await conn.fetch(
        """WITH datos AS (
            SELECT
                m.id AS materia_id,
                m.clave,
                m.nombre AS materia,
                g.periodo_id,
                p.codigo AS periodo,
                COUNT(DISTINCT i.id) AS inscritos,
                ROUND(AVG(rm.resultado_final)::NUMERIC, 2) AS promedio,
                COUNT(rm.id) FILTER (WHERE rm.resultado_final < 70) AS reprobados,
                COUNT(rm.id) AS con_resultado
            FROM academ.grupo g
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.materia m ON m.id = pm.materia_id
            JOIN academ.periodo_academico p ON p.id = g.periodo_id
            JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
            LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
            WHERE g.periodo_id IN ($1, $2)
            GROUP BY m.id, m.clave, m.nombre, g.periodo_id, p.codigo
        )
        SELECT
            COALESCE(a.materia_id, b.materia_id) AS materia_id,
            COALESCE(a.materia, b.materia) AS materia,
            a.promedio AS promedio_a,
            b.promedio AS promedio_b,
            ROUND((COALESCE(b.promedio,0) - COALESCE(a.promedio,0))::NUMERIC, 2) AS diferencia,
            CASE WHEN a.con_resultado > 0
                 THEN ROUND(100.0 * a.reprobados / a.con_resultado, 1)
                 ELSE NULL END AS pct_reprobacion_a,
            CASE WHEN b.con_resultado > 0
                 THEN ROUND(100.0 * b.reprobados / b.con_resultado, 1)
                 ELSE NULL END AS pct_reprobacion_b,
            COALESCE(a.inscritos, 0) AS inscritos_a,
            COALESCE(b.inscritos, 0) AS inscritos_b
        FROM (SELECT * FROM datos WHERE periodo_id = $1) a
        FULL OUTER JOIN (SELECT * FROM datos WHERE periodo_id = $2) b
            ON a.materia_id = b.materia_id
        ORDER BY materia""",
        periodo_a, periodo_b,
    )
    return [dict(r) for r in rows]


@router.get("/docentes-aprobacion")
async def docentes_aprobacion(
    periodo_id: Optional[int] = Query(None, description="ID del periodo (None = todos)"),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Ranking de docentes por índice de aprobación.
    Tabla: docente, núm. grupos, total alumnos, % aprobación, promedio general.
    """
    where = "AND g.periodo_id = $1" if periodo_id else ""
    params = [periodo_id] if periodo_id else []

    rows = await conn.fetch(
        f"""SELECT
                d.num_empleado,
                d.nombre || ' ' || d.apellido_pat || COALESCE(' ' || d.apellido_mat, '') AS docente,
                COUNT(DISTINCT g.id) AS num_grupos,
                COUNT(DISTINCT i.id) AS total_alumnos,
                COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70) AS aprobados,
                ROUND(
                    100.0 * COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70)
                    / NULLIF(COUNT(rm.id), 0), 1
                ) AS pct_aprobacion,
                ROUND(AVG(rm.resultado_final)::NUMERIC, 2) AS promedio_general
            FROM academ.docente d
            JOIN academ.grupo g ON g.docente_id = d.id {where}
            JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
            LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
            GROUP BY d.id, d.num_empleado, d.nombre, d.apellido_pat, d.apellido_mat
            ORDER BY pct_aprobacion DESC NULLS LAST""",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/mejores-alumnos")
async def mejores_alumnos(
    periodo_id: Optional[int] = Query(None),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Alumnos con mejor aprovechamiento.
    Tabla: num_control, nombre, promedio, materias cursadas, materias reprobadas.
    """
    where = "AND g.periodo_id = $1" if periodo_id else ""
    params = [periodo_id] if periodo_id else []

    rows = await conn.fetch(
        f"""SELECT
                a.no_control,
                a.nombre || ' ' || a.apellido_pat || COALESCE(' ' || a.apellido_mat, '') AS alumno,
                ROUND(AVG(rm.resultado_final)::NUMERIC, 2) AS promedio,
                COUNT(rm.id) AS materias_cursadas,
                COUNT(rm.id) FILTER (WHERE rm.resultado_final < 70) AS materias_reprobadas
            FROM academ.alumno a
            JOIN academ.inscripcion i ON i.alumno_id = a.id AND i.estado = 'ACTIVA'
            JOIN academ.grupo g ON g.id = i.grupo_id {where}
            JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
            GROUP BY a.id, a.no_control, a.nombre, a.apellido_pat, a.apellido_mat
            ORDER BY promedio DESC NULLS LAST
            LIMIT 100""",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/desercion")
async def desercion(
    periodo_id: int = Query(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Tasa de deserción por grupo: alumnos sin ninguna entrega ni calificación vs total inscritos.
    """
    rows = await conn.fetch(
        """SELECT
                g.nombre AS grupo,
                g.clave_grupo,
                m.nombre AS materia,
                d.nombre || ' ' || d.apellido_pat || COALESCE(' ' || d.apellido_mat, '') AS docente,
                COUNT(DISTINCT i.id) AS total_inscritos,
                COUNT(DISTINCT i.id) FILTER (
                    WHERE NOT EXISTS (
                        SELECT 1 FROM academ.resultado_actividad ra
                        WHERE ra.inscripcion_id = i.id
                    )
                    AND NOT EXISTS (
                        SELECT 1 FROM academ.entrega_actividad ea
                        WHERE ea.inscripcion_id = i.id
                    )
                ) AS sin_actividad,
                ROUND(
                    100.0 * COUNT(DISTINCT i.id) FILTER (
                        WHERE NOT EXISTS (
                            SELECT 1 FROM academ.resultado_actividad ra
                            WHERE ra.inscripcion_id = i.id
                        )
                        AND NOT EXISTS (
                            SELECT 1 FROM academ.entrega_actividad ea
                            WHERE ea.inscripcion_id = i.id
                        )
                    ) / NULLIF(COUNT(DISTINCT i.id), 0), 1
                ) AS tasa_desercion_pct
            FROM academ.grupo g
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.materia m ON m.id = pm.materia_id
            JOIN academ.docente d ON d.id = g.docente_id
            JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
            WHERE g.periodo_id = $1
            GROUP BY g.id, g.nombre, g.clave_grupo, m.nombre, d.nombre, d.apellido_pat
            ORDER BY tasa_desercion_pct DESC NULLS LAST""",
        periodo_id,
    )
    return [dict(r) for r in rows]


@router.get("/reprobacion-historica")
async def reprobacion_historica(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Materias con mayor índice de reprobación histórica (todos los periodos).
    """
    rows = await conn.fetch(
        """SELECT
                m.id,
                m.nombre AS materia,
                COUNT(rm.id) AS total_evaluados,
                COUNT(rm.id) FILTER (WHERE rm.resultado_final < 70) AS reprobados,
                ROUND(
                    100.0 * COUNT(rm.id) FILTER (WHERE rm.resultado_final < 70)
                    / NULLIF(COUNT(rm.id), 0), 1
                ) AS pct_reprobacion,
                ROUND(AVG(rm.resultado_final)::NUMERIC, 2) AS promedio_historico,
                COUNT(DISTINCT g.periodo_id) AS periodos_impartidos
            FROM academ.materia m
            JOIN academ.plan_materia pm ON pm.materia_id = m.id
            JOIN academ.grupo g ON g.plan_materia_id = pm.id
            JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
            JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
            GROUP BY m.id, m.nombre
            ORDER BY pct_reprobacion DESC NULLS LAST"""
    )
    return [dict(r) for r in rows]
