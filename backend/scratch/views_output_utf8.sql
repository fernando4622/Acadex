
--- v_resultados_parciales ---
 SELECT i.id AS inscripcion_id,
    al.matricula,
    (((al.nombre)::text || ' '::text) || (al.apellido_pat)::text) AS alumno,
    g.id AS grupo_id,
    g.nombre AS grupo,
    m.nombre AS materia,
    u.id AS unidad_id,
    u.numero AS unidad_numero,
    u.nombre AS unidad_nombre,
    u.estado AS unidad_estado,
    count(a.id) AS total_actividades,
    count(ra.id) AS actividades_con_resultado,
    round(COALESCE(sum((COALESCE(ra.calificacion, (0)::numeric) * (a.ponderacion / 100.0))), (0)::numeric), 4) AS promedio_parcial,
    COALESCE(bu.monto, (0)::numeric) AS bonus_unidad,
    round(LEAST((COALESCE(sum((COALESCE(ra.calificacion, (0)::numeric) * (a.ponderacion / 100.0))), (0)::numeric) + COALESCE(bu.monto, (0)::numeric)), g.calificacion_maxima), 4) AS resultado_estimado,
    ru.resultado_final AS resultado_persistido
   FROM ((((((((academ.inscripcion i
     JOIN academ.alumno al ON ((al.id = i.alumno_id)))
     JOIN academ.grupo g ON ((g.id = i.grupo_id)))
     JOIN academ.materia m ON ((m.id = g.materia_id)))
     JOIN academ.unidad u ON ((u.grupo_id = g.id)))
     LEFT JOIN academ.actividad a ON (((a.unidad_id = u.id) AND (a.activa = true))))
     LEFT JOIN academ.resultado_actividad ra ON (((ra.inscripcion_id = i.id) AND (ra.actividad_id = a.id))))
     LEFT JOIN academ.bonus_unidad bu ON (((bu.inscripcion_id = i.id) AND (bu.unidad_id = u.id))))
     LEFT JOIN academ.resultado_unidad ru ON (((ru.inscripcion_id = i.id) AND (ru.unidad_id = u.id))))
  WHERE ((i.estado)::text = 'ACTIVA'::text)
  GROUP BY i.id, al.matricula, al.nombre, al.apellido_pat, g.id, g.nombre, m.nombre, u.id, u.numero, u.nombre, u.estado, bu.monto, g.calificacion_maxima, ru.resultado_final;

--- v_analitica_docente ---
 WITH promedios_grupo AS (
         SELECT g.id AS grupo_id,
            g.nombre AS grupo,
            g.docente_id,
            (((d.nombre)::text || ' '::text) || (d.apellido_pat)::text) AS docente,
            m.id AS materia_id,
            m.nombre AS materia,
            p.codigo AS periodo,
            g.estado AS estado_grupo,
            count(i.id) AS total_alumnos,
            round(avg(rm.resultado_final), 2) AS promedio_grupo,
            count(rm.id) FILTER (WHERE (rm.resultado_final >= (70)::numeric)) AS aprobados,
            count(rm.id) FILTER (WHERE (rm.resultado_final < (70)::numeric)) AS reprobados,
            round(stddev(rm.resultado_final), 2) AS desviacion_estandar
           FROM (((((academ.grupo g
             JOIN academ.docente d ON ((d.id = g.docente_id)))
             JOIN academ.materia m ON ((m.id = g.materia_id)))
             JOIN academ.periodo_academico p ON ((p.id = g.periodo_id)))
             JOIN academ.inscripcion i ON (((i.grupo_id = g.id) AND ((i.estado)::text = 'ACTIVA'::text))))
             LEFT JOIN academ.resultado_materia rm ON ((rm.inscripcion_id = i.id)))
          GROUP BY g.id, g.nombre, g.docente_id, d.nombre, d.apellido_pat, m.id, m.nombre, p.codigo, g.estado
        ), promedio_materia_periodo AS (
         SELECT m.id AS materia_id,
            p.codigo AS periodo,
            round(avg(rm.resultado_final), 2) AS promedio_materia
           FROM ((((academ.resultado_materia rm
             JOIN academ.inscripcion i ON ((i.id = rm.inscripcion_id)))
             JOIN academ.grupo g ON ((g.id = i.grupo_id)))
             JOIN academ.materia m ON ((m.id = g.materia_id)))
             JOIN academ.periodo_academico p ON ((p.id = g.periodo_id)))
          GROUP BY m.id, p.codigo
        )
 SELECT pg.grupo_id,
    pg.grupo,
    pg.docente_id,
    pg.docente,
    pg.materia_id,
    pg.materia,
    pg.periodo,
    pg.estado_grupo,
    pg.total_alumnos,
    pg.promedio_grupo,
    pg.aprobados,
    pg.reprobados,
    pg.desviacion_estandar,
    pmp.promedio_materia,
    round((pg.promedio_grupo - pmp.promedio_materia), 2) AS diferencia_vs_materia,
        CASE
            WHEN (pg.promedio_grupo > pmp.promedio_materia) THEN 'SOBRE_PROMEDIO'::text
            WHEN (pg.promedio_grupo < pmp.promedio_materia) THEN 'BAJO_PROMEDIO'::text
            ELSE 'EN_PROMEDIO'::text
        END AS rendimiento_relativo,
    round(((100.0 * (pg.aprobados)::numeric) / (NULLIF(pg.total_alumnos, 0))::numeric), 1) AS eficiencia_terminal_pct
   FROM (promedios_grupo pg
     LEFT JOIN promedio_materia_periodo pmp ON (((pmp.materia_id = pg.materia_id) AND ((pmp.periodo)::text = (pg.periodo)::text))));

--- vw_mis_grupos ---
 SELECT i.alumno_id,
    g.id AS grupo_id,
    g.nombre,
    g.estado,
    g.calificacion_maxima,
    m.nombre AS materia,
    i.id AS inscripcion_id,
    i.estado AS estado_inscripcion,
    g.periodo_id,
    (((d.nombre)::text || ' '::text) || (d.apellido_pat)::text) AS docente,
    ( SELECT fn_calcular_resultado_materia.resultado_final
           FROM academ.fn_calcular_resultado_materia(i.id) fn_calcular_resultado_materia(promedio_base, bonus_aplicado, resultado_calculado, resultado_final, unidades_totales, unidades_con_result)) AS resultado_final
   FROM (((academ.inscripcion i
     JOIN academ.grupo g ON ((g.id = i.grupo_id)))
     JOIN academ.materia m ON ((m.id = g.materia_id)))
     JOIN academ.docente d ON ((d.id = g.docente_id)));

--- v_actividades_alumno ---
 SELECT i.alumno_id,
    i.id AS inscripcion_id,
    g.id AS grupo_id,
    g.nombre AS grupo,
    m.nombre AS materia,
    u.id AS unidad_id,
    u.numero AS unidad_numero,
    u.nombre AS unidad_nombre,
    u.estado AS unidad_estado,
    a.id AS actividad_id,
    (a.tipo)::text AS tipo_actividad,
    a.descripcion,
    a.ponderacion,
    a.orden,
    a.fecha_apertura,
    a.fecha_cierre,
        CASE
            WHEN ((a.fecha_apertura IS NULL) OR (now() >= a.fecha_apertura)) THEN true
            ELSE false
        END AS visible,
        CASE
            WHEN (a.fecha_cierre IS NULL) THEN 'ABIERTA'::text
            WHEN (now() > a.fecha_cierre) THEN 'CERRADA'::text
            ELSE 'EN_PLAZO'::text
        END AS estatus_plazo,
    ra.calificacion,
    ra.estado_entrega,
    ra.fecha_registro,
    ra.fecha_modificacion
   FROM (((((academ.inscripcion i
     JOIN academ.grupo g ON ((g.id = i.grupo_id)))
     JOIN academ.materia m ON ((m.id = g.materia_id)))
     JOIN academ.unidad u ON ((u.grupo_id = g.id)))
     JOIN academ.actividad a ON (((a.unidad_id = u.id) AND (a.activa = true))))
     LEFT JOIN academ.resultado_actividad ra ON (((ra.inscripcion_id = i.id) AND (ra.actividad_id = a.id))))
  WHERE ((i.estado)::text = 'ACTIVA'::text)
  ORDER BY u.numero, a.orden;

--- v_analitica_alumno ---
 WITH resultados_grupo AS (
         SELECT i_1.alumno_id,
            i_1.grupo_id,
            i_1.id AS inscripcion_id,
            rm.resultado_final,
            avg(rm.resultado_final) OVER (PARTITION BY i_1.grupo_id) AS promedio_grupo,
            stddev(rm.resultado_final) OVER (PARTITION BY i_1.grupo_id) AS desviacion_grupo,
            count(*) OVER (PARTITION BY i_1.grupo_id) AS total_alumnos,
            rank() OVER (PARTITION BY i_1.grupo_id ORDER BY rm.resultado_final DESC) AS posicion_grupo,
            percent_rank() OVER (PARTITION BY i_1.grupo_id ORDER BY rm.resultado_final) AS percentil_ascendente
           FROM (academ.inscripcion i_1
             JOIN academ.resultado_materia rm ON ((rm.inscripcion_id = i_1.id)))
          WHERE ((i_1.estado)::text = 'ACTIVA'::text)
        )
 SELECT rg.alumno_id,
    al.matricula,
    (((al.nombre)::text || ' '::text) || (al.apellido_pat)::text) AS alumno,
    m.nombre AS materia,
    g.nombre AS grupo,
    p.codigo AS periodo,
    rg.inscripcion_id,
    round((rg.resultado_final)::numeric, 2) AS resultado_final,
    round(rg.promedio_grupo, 2) AS promedio_grupo,
    round((rg.resultado_final - rg.promedio_grupo), 2) AS diferencia_vs_media,
        CASE
            WHEN (rg.resultado_final > rg.promedio_grupo) THEN 'SOBRE_MEDIA'::text
            WHEN (rg.resultado_final < rg.promedio_grupo) THEN 'BAJO_MEDIA'::text
            ELSE 'EN_MEDIA'::text
        END AS posicion_relativa,
    rg.posicion_grupo,
    rg.total_alumnos,
    (round((((1)::double precision - rg.percentil_ascendente) * (100)::double precision)))::integer AS percentil_superior,
        CASE
            WHEN (rg.resultado_final >= (70)::numeric) THEN 'APROBADO'::text
            ELSE 'REPROBADO'::text
        END AS estatus
   FROM (((((resultados_grupo rg
     JOIN academ.alumno al ON ((al.id = rg.alumno_id)))
     JOIN academ.inscripcion i ON ((i.id = rg.inscripcion_id)))
     JOIN academ.grupo g ON ((g.id = rg.grupo_id)))
     JOIN academ.materia m ON ((m.id = g.materia_id)))
     JOIN academ.periodo_academico p ON ((p.id = g.periodo_id)));
