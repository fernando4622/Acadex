from typing import Optional
from uuid import UUID
import asyncpg
from fastapi import APIRouter, Depends
from asyncpg import Connection
from app.database import get_conn
from app.middleware.auth import (
    require_admin, require_docente_o_admin, get_current_user,
    is_admin, is_docente, is_alumno, assert_docente_en_grupo
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# DASHBOARD ADMIN — usa v_analitica_admin + métricas globales
@router.get("/admin")
async def get_admin_stats(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    # 1. Métricas globales institucionales
    stats_globales = await conn.fetchrow("""
        SELECT
            AVG(resultado_final)::float                                    AS promedio_general,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY resultado_final)::float AS mediana,
            STDDEV(resultado_final)::float                                  AS desviacion_estandar,
            COUNT(*)                                                        AS total_estudiantes,
            COUNT(*) FILTER (WHERE resultado_final <  70)                   AS reprobados,
            COUNT(*) FILTER (WHERE resultado_final >= 70)                   AS aprobados,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE resultado_final < 70)
                / NULLIF(COUNT(*), 0)
            , 1)::float                                                     AS tasa_reprobacion_pct
        FROM academ.resultado_materia
    """)

    # 2. Distribución de calificaciones (histograma 0-10 o 0-100 según la escala)
    distribucion = await conn.fetch("""
        SELECT
            (floor(resultado_final / 10) * 10)::int AS rango_inicio,
            count(*)                                 AS cantidad
        FROM academ.resultado_materia
        GROUP BY rango_inicio
        ORDER BY rango_inicio
    """)

    # 3. Analítica por materia / docente (desde vista BI)
    por_materia = await conn.fetch("""
        SELECT materia, clave_materia, periodo, docente, grupo,
               total_inscritos, aprobados, reprobados,
               promedio_grupo, tasa_reprobacion_pct, eficiencia_terminal_pct
        FROM academ.v_analitica_admin
        ORDER BY tasa_reprobacion_pct DESC NULLS LAST
        LIMIT 20
    """)

    # 4. Tendencia por periodo
    tendencia = await conn.fetch("""
        SELECT p.nombre AS periodo,
               ROUND(AVG(rm.resultado_final)::NUMERIC, 2) AS promedio
        FROM academ.resultado_materia rm
        JOIN academ.inscripcion i ON i.id = rm.inscripcion_id
        JOIN academ.grupo g ON g.id = i.grupo_id
        JOIN academ.periodo_academico p ON p.id = g.periodo_id
        GROUP BY p.id, p.nombre, p.fecha_inicio
        ORDER BY p.fecha_inicio ASC
    """)

    # 5. Eficiencia terminal por docente (ranking)
    eficiencia_docentes = await conn.fetch("""
        SELECT docente,
               ROUND(AVG(eficiencia_terminal_pct)::NUMERIC, 1) AS eficiencia_pct,
               ROUND(AVG(promedio_grupo)::NUMERIC, 2)           AS promedio_promedio,
               SUM(total_inscritos)                             AS alumnos_total
        FROM academ.v_analitica_admin
        GROUP BY docente
        ORDER BY eficiencia_pct DESC
        LIMIT 10
    """)

    # 6. Totales de catálogos
    totales = await conn.fetchrow("""
        SELECT
            (SELECT COUNT(*) FROM academ.alumno  WHERE activo = TRUE) AS alumnos,
            (SELECT COUNT(*) FROM academ.docente WHERE activo = TRUE) AS docentes,
            (SELECT COUNT(*) FROM academ.materia WHERE activa = TRUE) AS materias,
            (SELECT COUNT(*) FROM academ.grupo)                        AS grupos,
            (SELECT COUNT(*) FROM academ.grupo WHERE estado = 'ACTIVO') AS grupos_activos
    """)

    return {
        "globales":           dict(stats_globales) if stats_globales else {},
        "distribucion":       [dict(r) for r in distribucion],
        "por_materia":        [dict(r) for r in por_materia],
        "tendencia":          [dict(r) for r in tendencia],
        "eficiencia_docentes":[dict(r) for r in eficiencia_docentes],
        "totales":            dict(totales),
    }


# DASHBOARD DOCENTE — usa v_analitica_docente
@router.get("/docente")
async def get_docente_stats(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    docente_id = user["id_entidad"]

    # KPIs de los grupos del docente usando la vista analítica
    kpis = await conn.fetch("""
        SELECT grupo_id, grupo, materia, periodo, estado_grupo,
               total_alumnos, promedio_grupo, promedio_materia,
               diferencia_vs_materia, rendimiento_relativo,
               aprobados, reprobados, eficiencia_terminal_pct,
               desviacion_estandar
        FROM academ.v_analitica_docente
        WHERE docente_id = $1
        ORDER BY periodo DESC, grupo
    """, docente_id)

    # Unidades con captura pendiente (Solo la actual de cada grupo)
    pendientes = await conn.fetch("""
        WITH pendientes_all AS (
            SELECT u.id AS unidad_id, u.numero, u.nombre AS unidad, g.nombre AS grupo, g.id AS grupo_id,
                   vsp.suma_ponderaciones, vsp.pendiente, vsp.estructura_completa,
                   COUNT(vcp.inscripcion_id) FILTER (WHERE vcp.pendiente = TRUE) AS calificaciones_pendientes
            FROM academ.unidad u
            JOIN academ.grupo g ON g.id = u.grupo_id
            LEFT JOIN academ.v_suma_ponderaciones vsp ON vsp.unidad_id = u.id
            LEFT JOIN academ.v_captura_pendiente  vcp ON vcp.unidad_id = u.id
            WHERE g.docente_id = $1 AND u.estado = 'EDICION'
            GROUP BY u.id, u.numero, u.nombre, g.id, g.nombre,
                     vsp.suma_ponderaciones, vsp.pendiente, vsp.estructura_completa
        ),
        primeras_pendientes AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY grupo_id ORDER BY numero ASC) as rn
            FROM pendientes_all
        )
        SELECT * FROM primeras_pendientes WHERE rn = 1
        ORDER BY grupo, numero
    """, docente_id)

    # Actividades con vencimiento cercano
    actividades_cercanas = await conn.fetch("""
        SELECT 
            COALESCE(a.descripcion, 'Actividad de ' || g.nombre) AS title,
            TO_JSON(a.fecha_cierre)#>>'{}' AS date,
            g.id AS grupo_id,
            u.id AS unidad_id,
            a.id AS actividad_id
        FROM academ.actividad a
        JOIN academ.unidad u ON u.id = a.unidad_id
        JOIN academ.grupo g ON g.id = u.grupo_id
        WHERE g.docente_id = $1 
          AND a.activa = TRUE 
          AND a.fecha_cierre IS NOT NULL
          AND a.fecha_cierre >= CURRENT_DATE
        ORDER BY a.fecha_cierre ASC
    """, docente_id)

    return {
        "kpis":       [dict(r) for r in kpis],
        "pendientes": [dict(r) for r in pendientes],
        "actividades_cercanas": [dict(r) for r in actividades_cercanas],
    }


# DASHBOARD ALUMNO — usa v_analitica_alumno
@router.get("/alumno")
async def get_alumno_stats(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    try:
        alumno_id = user["id_entidad"]

        # Posicionamiento en cada grupo con resultado
        posicionamiento = await conn.fetch("""
            SELECT materia, grupo, periodo,
                   inscripcion_id, resultado_final, promedio_grupo,
                   diferencia_vs_media, posicion_relativa,
                   posicion_grupo, total_alumnos, percentil_superior, estatus
            FROM academ.v_analitica_alumno
            WHERE alumno_id = $1::UUID
            ORDER BY periodo DESC, materia
        """, alumno_id)

        # Calificaciones en curso (grupos sin resultado final)
        en_curso = await conn.fetch("""
            SELECT m.nombre AS materia, p.nombre AS periodo,
                   g.estado AS estado_grupo, i.id AS inscripcion_id,
                   calc.unidades_con_result, calc.unidades_totales,
                   calc.resultado_final AS resultado_estimado
            FROM academ.inscripcion i
            JOIN academ.grupo g ON g.id = i.grupo_id
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.materia m ON m.id = pm.materia_id
            JOIN academ.periodo_academico p ON p.id = g.periodo_id
            LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
            LEFT JOIN LATERAL academ.fn_calcular_resultado_materia(i.id) calc ON true
            WHERE i.alumno_id = $1::UUID AND i.estado = 'ACTIVA'
              AND rm.id IS NULL
        """, alumno_id)

        # Actividades con vencimiento cercano
        actividades_cercanas = []
        try:
            actividades_cercanas = await conn.fetch("""
                SELECT 
                    COALESCE(a.descripcion, 'Actividad de ' || g.nombre) AS title,
                    TO_JSON(a.fecha_cierre)#>>'{}' AS date,
                    i.id AS inscripcion_id
                FROM academ.actividad a
                JOIN academ.unidad u ON u.id = a.unidad_id
                JOIN academ.grupo g ON g.id = u.grupo_id
                JOIN academ.inscripcion i ON i.grupo_id = g.id
                WHERE i.alumno_id = $1::UUID 
                  AND i.estado = 'ACTIVA'
                  AND a.activa = TRUE 
                  AND a.fecha_cierre IS NOT NULL
                  AND a.fecha_cierre >= CURRENT_DATE
                ORDER BY a.fecha_cierre ASC
            """, alumno_id)
        except Exception as query_err:
            print(f"Error fetching actividades_cercanas: {query_err}")

        return {
            "posicionamiento": [dict(r) for r in posicionamiento],
            "en_curso":        [dict(r) for r in en_curso],
            "actividades_cercanas": [dict(r) for r in actividades_cercanas],
        }
    except Exception as e:
        print(f"Error general en dashboard alumno: {e}")
        return {"error": str(e)}


# REPORTE DETALLADO — acceso Admin o Docente en su grupo
@router.get("/reporte-detallado")
async def get_detailed_report(
    grupo_id: Optional[UUID] = None,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    if not is_admin(user):
        if not grupo_id:
            from fastapi import HTTPException
            raise HTTPException(403, detail={"codigo": "SIN_PERMISO",
                                             "mensaje": "Solo el administrador puede ver reportes globales."})
        assert_docente_en_grupo(user, grupo_id)

    query = """
        SELECT al.no_control,
               al.nombre || ' ' || al.apellido_pat || COALESCE(' ' || al.apellido_mat, '') AS alumno,
               m.nombre AS materia,
               rm.resultado_final,
               CASE WHEN rm.resultado_final >= 70 THEN 'APROBADO' ELSE 'REPROBADO' END AS estatus,
               COALESCE(bm.monto, 0) AS bonus_materia,
               bm.justificacion
        FROM academ.resultado_materia rm
        JOIN academ.inscripcion i   ON i.id  = rm.inscripcion_id
        JOIN academ.alumno     al  ON al.id  = i.alumno_id
        JOIN academ.grupo      g   ON g.id   = i.grupo_id
        JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
        JOIN academ.materia    m   ON m.id   = pm.materia_id
        LEFT JOIN academ.bonus_materia bm ON bm.inscripcion_id = i.id
    """
    if grupo_id:
        query += " WHERE g.id = $1 ORDER BY al.apellido_pat, al.nombre"
        rows = await conn.fetch(query, grupo_id)
    else:
        query += " ORDER BY al.apellido_pat, al.nombre, m.nombre"
        rows = await conn.fetch(query)

    return [dict(r) for r in rows]


# ENDPOINT EXTRA: Tipos de actividad disponibles
@router.get("/tipos-actividad")
async def tipos_actividad(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    """Devuelve los nombres activos del catálogo vigente para poblar dropdowns."""
    rows = await conn.fetch("""
        SELECT nombre AS tipo
        FROM academ.tipo_actividad_catalogo
        WHERE activo = TRUE
        ORDER BY nombre
    """)
    return [r["tipo"] for r in rows]
