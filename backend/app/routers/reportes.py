"""
Router de Reportes — Alta prioridad.

Endpoints:
  R1  GET /reportes/boleta/{alumno_id}          Boleta individual del alumno
  R2  GET /reportes/grupo/{grupo_id}/calificaciones  Calificaciones por grupo con parciales
  R3  GET /reportes/por-materia                 Todos los grupos de una materia
  R7  GET /reportes/indice-reprobacion          Índice unificado con filtros
  R11 GET /reportes/reprobados                  Lista de alumnos reprobados
  R12 GET /reportes/riesgo-academico            Alumnos en riesgo (datos reales)
  R13 GET /reportes/estado-captura              Estado de captura por docente/materia
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from asyncpg import Connection
from typing import Optional
from uuid import UUID

from app.database import get_conn
from app.middleware.auth import require_admin, get_current_user, is_admin

router = APIRouter(prefix="/reportes", tags=["Reportes"])


# R1 — Boleta individual del alumno
# Acceso: Admin (cualquier alumno_id) o Alumno (solo su propio)
@router.get("/boleta/{alumno_id}")
async def boleta_alumno(
    alumno_id: UUID,
    periodo_id: Optional[int] = Query(None, description="Filtrar por periodo. None = todos"),
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """
    Boleta académica individual.
    Retorna: matrícula, nombre, grupo (desde inscripción), periodo,
             materias, calificaciones, promedio, reprobadas.
    """
    # Control de acceso: alumno solo puede ver su propia boleta
    if not is_admin(user):
        if str(user.get("id_entidad", "")) != str(alumno_id):
            raise HTTPException(403, detail={"codigo": "SIN_PERMISO", "mensaje": "Solo puedes ver tu propia boleta."})

    # Datos del alumno
    alumno = await conn.fetchrow(
        """SELECT a.matricula, a.no_control,
                  a.nombre || ' ' || a.apellido_pat || COALESCE(' ' || a.apellido_mat, '') AS nombre_completo,
                  a.email,
                  c.nombre AS carrera,
                  pe.nombre AS plan_estudio
           FROM academ.alumno a
           LEFT JOIN academ.plan_estudio pe ON pe.id = a.plan_estudio_id
           LEFT JOIN academ.carrera c ON c.id = pe.carrera_id
           WHERE a.id = $1""",
        alumno_id,
    )
    if not alumno:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Alumno no encontrado."})

    # Materias con calificaciones — grupo viene de inscripción
    where_periodo = "AND g.periodo_id = $2" if periodo_id else ""
    params = [alumno_id, periodo_id] if periodo_id else [alumno_id]

    materias = await conn.fetch(
        f"""SELECT
                p.codigo    AS periodo,
                p.nombre    AS periodo_nombre,
                g.nombre    AS grupo,
                g.clave_grupo,
                m.nombre    AS materia,
                m.clave     AS clave_materia,
                d.nombre || ' ' || d.apellido_pat AS docente,
                i.id        AS inscripcion_id,
                i.estado    AS estado_inscripcion,
                rm.resultado_final,
                CASE WHEN rm.resultado_final IS NOT NULL
                     THEN CASE WHEN rm.resultado_final >= 70 THEN 'APROBADO' ELSE 'REPROBADO' END
                     ELSE 'EN_CURSO'
                END AS estatus,
                -- Parciales (resultado por unidad)
                (SELECT jsonb_agg(
                    jsonb_build_object(
                        'numero', u.numero,
                        'nombre', u.nombre,
                        'resultado', ru.resultado_final
                    ) ORDER BY u.numero
                )
                FROM academ.unidad u
                LEFT JOIN academ.resultado_unidad ru ON ru.unidad_id = u.id AND ru.inscripcion_id = i.id
                WHERE u.grupo_id = g.id
                ) AS parciales
            FROM academ.inscripcion i
            JOIN academ.grupo g ON g.id = i.grupo_id
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.materia m ON m.id = pm.materia_id
            JOIN academ.periodo_academico p ON p.id = g.periodo_id
            LEFT JOIN academ.docente d ON d.id = g.docente_id
            LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
            WHERE i.alumno_id = $1 AND i.estado = 'ACTIVA'
            {where_periodo}
            ORDER BY p.fecha_inicio DESC, m.nombre""",
        *params,
    )

    rows = [dict(r) for r in materias]
    total = len(rows)
    aprobadas = sum(1 for r in rows if r["estatus"] == "APROBADO")
    reprobadas = sum(1 for r in rows if r["estatus"] == "REPROBADO")
    califs_finales = [r["resultado_final"] for r in rows if r["resultado_final"] is not None]
    promedio = round(sum(califs_finales) / len(califs_finales), 2) if califs_finales else None

    return {
        "alumno": dict(alumno),
        "resumen": {
            "total_materias": total,
            "aprobadas": aprobadas,
            "reprobadas": reprobadas,
            "en_curso": total - aprobadas - reprobadas,
            "promedio_general": promedio,
        },
        "materias": rows,
    }


# R2 — Calificaciones por grupo (con parciales por columna)
@router.get("/grupo/{grupo_id}/calificaciones")
async def calificaciones_por_grupo(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Todos los alumnos de un grupo con su resultado final y resultado por unidad.
    """
    # Info del grupo
    grupo = await conn.fetchrow(
        """SELECT g.nombre, g.clave_grupo, g.estado, g.calificacion_maxima,
                  m.nombre AS materia, m.clave AS clave_materia,
                  p.nombre AS periodo, p.codigo AS periodo_codigo,
                  d.nombre || ' ' || d.apellido_pat AS docente
           FROM academ.grupo g
           JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
           JOIN academ.materia m ON m.id = pm.materia_id
           JOIN academ.periodo_academico p ON p.id = g.periodo_id
           LEFT JOIN academ.docente d ON d.id = g.docente_id
           WHERE g.id = $1""",
        grupo_id,
    )
    if not grupo:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Grupo no encontrado."})

    # Unidades del grupo
    unidades = await conn.fetch(
        "SELECT id, numero, nombre FROM academ.unidad WHERE grupo_id = $1 ORDER BY numero",
        grupo_id,
    )

    # Alumnos con resultados
    alumnos = await conn.fetch(
        """SELECT
                a.no_control AS matricula,
                a.nombre || ' ' || a.apellido_pat || COALESCE(' ' || a.apellido_mat,'') AS alumno,
                i.id AS inscripcion_id,
                rm.resultado_final,
                CASE WHEN rm.resultado_final IS NOT NULL
                     THEN CASE WHEN rm.resultado_final >= 70 THEN 'APROBADO' ELSE 'REPROBADO' END
                     ELSE 'EN_CURSO' END AS estatus,
                -- JSON con resultado por unidad
                (SELECT jsonb_object_agg(u2.numero::text, COALESCE(ru.resultado_final::text, '—'))
                 FROM academ.unidad u2
                 LEFT JOIN academ.resultado_unidad ru ON ru.unidad_id = u2.id AND ru.inscripcion_id = i.id
                 WHERE u2.grupo_id = $1
                ) AS por_unidad
           FROM academ.inscripcion i
           JOIN academ.alumno a ON a.id = i.alumno_id
           LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
           WHERE i.grupo_id = $1 AND i.estado = 'ACTIVA'
           ORDER BY a.apellido_pat, a.nombre""",
        grupo_id,
    )

    rows = [dict(r) for r in alumnos]
    califs = [r["resultado_final"] for r in rows if r["resultado_final"] is not None]
    promedio_grupo = round(sum(califs) / len(califs), 2) if califs else None

    return {
        "grupo": dict(grupo),
        "unidades": [dict(u) for u in unidades],
        "estadisticas": {
            "total_alumnos": len(rows),
            "aprobados": sum(1 for r in rows if r["estatus"] == "APROBADO"),
            "reprobados": sum(1 for r in rows if r["estatus"] == "REPROBADO"),
            "promedio_grupo": promedio_grupo,
        },
        "alumnos": rows,
    }


# R3 — Reporte por materia (todos los grupos de una materia en un periodo)
@router.get("/por-materia")
async def reporte_por_materia(
    materia_id: int = Query(..., description="ID de la materia"),
    periodo_id: Optional[int] = Query(None, description="ID del periodo. None = todos"),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Alumnos inscritos en todos los grupos de una materia, con grupo, docente,
    parciales y calificación final.
    """
    where_periodo = "AND g.periodo_id = $2" if periodo_id else ""
    params = [materia_id, periodo_id] if periodo_id else [materia_id]

    rows = await conn.fetch(
        f"""SELECT
                p.codigo            AS periodo,
                g.nombre            AS grupo,
                g.clave_grupo,
                d.nombre || ' ' || d.apellido_pat AS docente,
                a.no_control        AS matricula,
                a.nombre || ' ' || a.apellido_pat || COALESCE(' ' || a.apellido_mat,'') AS alumno,
                i.id                AS inscripcion_id,
                rm.resultado_final,
                CASE WHEN rm.resultado_final IS NOT NULL
                     THEN CASE WHEN rm.resultado_final >= 70 THEN 'APROBADO' ELSE 'REPROBADO' END
                     ELSE 'EN_CURSO' END AS estatus,
                (SELECT jsonb_agg(
                    jsonb_build_object('numero', u.numero, 'resultado', ru.resultado_final)
                    ORDER BY u.numero
                 )
                 FROM academ.unidad u
                 LEFT JOIN academ.resultado_unidad ru
                       ON ru.unidad_id = u.id AND ru.inscripcion_id = i.id
                 WHERE u.grupo_id = g.id
                ) AS parciales
            FROM academ.grupo g
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.materia m ON m.id = pm.materia_id
            JOIN academ.periodo_academico p ON p.id = g.periodo_id
            LEFT JOIN academ.docente d ON d.id = g.docente_id
            JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
            JOIN academ.alumno a ON a.id = i.alumno_id
            LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
            WHERE m.id = $1 {where_periodo}
            ORDER BY p.fecha_inicio DESC, g.nombre, a.apellido_pat, a.nombre""",
        *params,
    )

    # Estadísticas globales de la materia
    total = len(rows)
    aprobados = sum(1 for r in rows if r["estatus"] == "APROBADO")
    reprobados = sum(1 for r in rows if r["estatus"] == "REPROBADO")
    califs = [r["resultado_final"] for r in rows if r["resultado_final"] is not None]
    promedio = round(sum(califs) / len(califs), 2) if califs else None

    return {
        "estadisticas": {
            "total_alumnos": total,
            "aprobados": aprobados,
            "reprobados": reprobados,
            "promedio_materia": promedio,
            "pct_reprobacion": round(100 * reprobados / total, 1) if total > 0 else 0,
        },
        "alumnos": [dict(r) for r in rows],
    }


# R7 — Índice de reprobación unificado con filtros combinados
@router.get("/indice-reprobacion")
async def indice_reprobacion(
    periodo_id: Optional[int] = Query(None),
    carrera_id: Optional[int] = Query(None),
    materia_id: Optional[int] = Query(None),
    docente_id: Optional[UUID] = Query(None),
    grupo_id: Optional[UUID] = Query(None),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Índice de reprobación filtrable por periodo, carrera, materia, docente o grupo.
    Retorna agrupado por materia con desglose por grupo/docente/periodo.
    """
    conditions = ["1=1"]
    params: list = []
    idx = 1

    if periodo_id:
        conditions.append(f"g.periodo_id = ${idx}")
        params.append(periodo_id); idx += 1
    if carrera_id:
        conditions.append(f"pe.carrera_id = ${idx}")
        params.append(carrera_id); idx += 1
    if materia_id:
        conditions.append(f"m.id = ${idx}")
        params.append(materia_id); idx += 1
    if docente_id:
        conditions.append(f"g.docente_id = ${idx}::uuid")
        params.append(docente_id); idx += 1
    if grupo_id:
        conditions.append(f"g.id = ${idx}::uuid")
        params.append(grupo_id); idx += 1

    where = " AND ".join(conditions)

    rows = await conn.fetch(
        f"""SELECT
                m.id        AS materia_id,
                m.nombre    AS materia,
                m.clave     AS clave_materia,
                p.codigo    AS periodo,
                g.nombre    AS grupo,
                g.clave_grupo,
                d.nombre || ' ' || d.apellido_pat AS docente,
                COUNT(i.id)                         AS total_inscritos,
                COUNT(rm.id)                        AS total_evaluados,
                COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70) AS aprobados,
                COUNT(rm.id) FILTER (WHERE rm.resultado_final < 70)  AS reprobados,
                ROUND(AVG(rm.resultado_final)::NUMERIC, 2)           AS promedio,
                CASE WHEN COUNT(rm.id) > 0
                     THEN ROUND(100.0 * COUNT(rm.id) FILTER (WHERE rm.resultado_final < 70) / COUNT(rm.id), 1)
                     ELSE NULL END                                    AS pct_reprobacion
            FROM academ.grupo g
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
            JOIN academ.materia m ON m.id = pm.materia_id
            JOIN academ.periodo_academico p ON p.id = g.periodo_id
            LEFT JOIN academ.docente d ON d.id = g.docente_id
            JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
            LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
            WHERE {where}
            GROUP BY m.id, m.nombre, m.clave, p.id, p.codigo, g.id, g.nombre, g.clave_grupo,
                     d.nombre, d.apellido_pat
            ORDER BY pct_reprobacion DESC NULLS LAST, m.nombre""",
        *params,
    )
    return [dict(r) for r in rows]


# R11 — Lista de alumnos reprobados con filtros
@router.get("/reprobados")
async def lista_reprobados(
    periodo_id: Optional[int] = Query(None),
    grupo_id: Optional[UUID] = Query(None),
    materia_id: Optional[int] = Query(None),
    docente_id: Optional[UUID] = Query(None),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Lista de alumnos reprobados con filtros por periodo, grupo, materia o docente.
    Solo incluye inscripciones con resultado_final registrado y < 70.
    """
    conditions = ["rm.resultado_final < 70"]
    params: list = []
    idx = 1

    if periodo_id:
        conditions.append(f"g.periodo_id = ${idx}")
        params.append(periodo_id); idx += 1
    if grupo_id:
        conditions.append(f"g.id = ${idx}::uuid")
        params.append(grupo_id); idx += 1
    if materia_id:
        conditions.append(f"m.id = ${idx}")
        params.append(materia_id); idx += 1
    if docente_id:
        conditions.append(f"g.docente_id = ${idx}::uuid")
        params.append(docente_id); idx += 1

    where = " AND ".join(conditions)

    rows = await conn.fetch(
        f"""SELECT
                a.no_control    AS matricula,
                a.nombre || ' ' || a.apellido_pat || COALESCE(' ' || a.apellido_mat,'') AS alumno,
                m.nombre        AS materia,
                m.clave         AS clave_materia,
                g.nombre        AS grupo,
                g.clave_grupo,
                p.codigo        AS periodo,
                d.nombre || ' ' || d.apellido_pat AS docente,
                rm.resultado_final,
                i.id            AS inscripcion_id
            FROM academ.resultado_materia rm
            JOIN academ.inscripcion i ON i.id = rm.inscripcion_id
            JOIN academ.alumno a ON a.id = i.alumno_id
            JOIN academ.grupo g ON g.id = i.grupo_id
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.materia m ON m.id = pm.materia_id
            JOIN academ.periodo_academico p ON p.id = g.periodo_id
            LEFT JOIN academ.docente d ON d.id = g.docente_id
            WHERE {where}
            ORDER BY a.apellido_pat, a.nombre, m.nombre""",
        *params,
    )
    return [dict(r) for r in rows]


# R12 — Alumnos en riesgo académico (datos reales)
# Criterios: promedio estimado < 70 → riesgo ALTO, 70-79 → MEDIO, >= 80 → BAJO
@router.get("/riesgo-academico")
async def riesgo_academico(
    periodo_id: Optional[int] = Query(None, description="Periodo a evaluar. None = periodo activo"),
    grupo_id: Optional[UUID] = Query(None),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Detecta alumnos en riesgo académico en base a su resultado estimado actual.
    """
    # Si no se da periodo, usar el activo
    if not periodo_id:
        periodo_id = await conn.fetchval(
            "SELECT id FROM academ.periodo_academico WHERE activo = TRUE LIMIT 1"
        )
    if not periodo_id:
        return {"periodo_id": None, "alumnos": [], "resumen": {}}

    where_grupo = "AND g.id = $2::uuid" if grupo_id else ""
    params = [periodo_id, grupo_id] if grupo_id else [periodo_id]

    rows = await conn.fetch(
        f"""SELECT
                a.no_control    AS matricula,
                a.nombre || ' ' || a.apellido_pat || COALESCE(' ' || a.apellido_mat,'') AS alumno,
                g.nombre        AS grupo,
                g.id            AS grupo_id,
                m.nombre        AS materia,
                i.id            AS inscripcion_id,
                calc.resultado_final   AS promedio_estimado,
                calc.unidades_con_result,
                calc.unidades_totales,
                CASE
                    WHEN calc.resultado_final IS NULL THEN 'SIN_DATOS'
                    WHEN calc.resultado_final < 60 THEN 'ALTO'
                    WHEN calc.resultado_final < 70 THEN 'MEDIO'
                    ELSE 'BAJO'
                END AS nivel_riesgo
            FROM academ.inscripcion i
            JOIN academ.alumno a ON a.id = i.alumno_id
            JOIN academ.grupo g ON g.id = i.grupo_id
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.materia m ON m.id = pm.materia_id
            LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
            LEFT JOIN LATERAL academ.fn_calcular_resultado_materia(i.id) calc ON TRUE
            WHERE g.periodo_id = $1
              AND i.estado = 'ACTIVA'
              AND rm.id IS NULL           -- Solo grupos sin resultado final cerrado
              {where_grupo}
            ORDER BY calc.resultado_final ASC NULLS LAST, a.apellido_pat""",
        *params,
    )

    alumnos = [dict(r) for r in rows]
    alto = sum(1 for a in alumnos if a["nivel_riesgo"] == "ALTO")
    medio = sum(1 for a in alumnos if a["nivel_riesgo"] == "MEDIO")
    bajo = sum(1 for a in alumnos if a["nivel_riesgo"] == "BAJO")

    return {
        "periodo_id": periodo_id,
        "resumen": {
            "total_en_riesgo": alto + medio,
            "riesgo_alto": alto,
            "riesgo_medio": medio,
            "riesgo_bajo": bajo,
            "sin_datos": sum(1 for a in alumnos if a["nivel_riesgo"] == "SIN_DATOS"),
        },
        "alumnos": alumnos,
    }


# R13 — Estado de captura de calificaciones (global para Admin)
@router.get("/estado-captura")
async def estado_captura(
    periodo_id: Optional[int] = Query(None, description="Filtrar por periodo. None = activo"),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Vista global del estado de captura de calificaciones por docente → materia → grupo.
    Estado: COMPLETO (todas las unidades cerradas), PARCIAL (alguna), PENDIENTE (ninguna).
    """
    if not periodo_id:
        periodo_id = await conn.fetchval(
            "SELECT id FROM academ.periodo_academico WHERE activo = TRUE LIMIT 1"
        )

    rows = await conn.fetch(
        """SELECT
                d.nombre || ' ' || d.apellido_pat AS docente,
                d.num_empleado,
                m.nombre    AS materia,
                g.nombre    AS grupo,
                g.id        AS grupo_id,
                p.codigo    AS periodo,
                COUNT(u.id)                                          AS total_unidades,
                COUNT(u.id) FILTER (WHERE u.estado = 'FINALIZADO')  AS unidades_cerradas,
                COUNT(u.id) FILTER (WHERE u.estado = 'EDICION')     AS unidades_abiertas,
                CASE
                    WHEN COUNT(u.id) = 0 THEN 'SIN_UNIDADES'
                    WHEN COUNT(u.id) FILTER (WHERE u.estado = 'FINALIZADO') = COUNT(u.id) THEN 'COMPLETO'
                    WHEN COUNT(u.id) FILTER (WHERE u.estado = 'FINALIZADO') > 0 THEN 'PARCIAL'
                    ELSE 'PENDIENTE'
                END AS estado_captura,
                COUNT(DISTINCT i.id) AS total_alumnos
            FROM academ.grupo g
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.materia m ON m.id = pm.materia_id
            JOIN academ.periodo_academico p ON p.id = g.periodo_id
            JOIN academ.docente d ON d.id = g.docente_id
            LEFT JOIN academ.unidad u ON u.grupo_id = g.id
            LEFT JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
            WHERE g.periodo_id = $1
            GROUP BY d.id, d.nombre, d.apellido_pat, d.num_empleado,
                     m.nombre, g.id, g.nombre, p.codigo
            ORDER BY estado_captura, d.apellido_pat, m.nombre""",
        periodo_id,
    )

    result = [dict(r) for r in rows]
    return {
        "periodo_id": periodo_id,
        "resumen": {
            "completo": sum(1 for r in result if r["estado_captura"] == "COMPLETO"),
            "parcial": sum(1 for r in result if r["estado_captura"] == "PARCIAL"),
            "pendiente": sum(1 for r in result if r["estado_captura"] == "PENDIENTE"),
            "sin_unidades": sum(1 for r in result if r["estado_captura"] == "SIN_UNIDADES"),
        },
        "grupos": result,
    }


# Catálogos auxiliares para los filtros de los reportes
@router.get("/catalogos/grupos-periodo")
async def grupos_por_periodo(
    periodo_id: int = Query(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """Retorna grupos de un periodo para poblar el filtro de grupo."""
    rows = await conn.fetch(
        """SELECT g.id, g.nombre, g.clave_grupo,
                  m.nombre AS materia, m.id AS materia_id
           FROM academ.grupo g
           JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
           JOIN academ.materia m ON m.id = pm.materia_id
           WHERE g.periodo_id = $1
           ORDER BY m.nombre, g.nombre""",
        periodo_id,
    )
    return [dict(r) for r in rows]
