-- =============================================================================
-- MIGRACIÓN: Corregir fn_desglose_alumno — JOIN a través de plan_materia
-- =============================================================================
-- PROBLEMA: La función usaba  g.materia_id  directamente, pero la tabla grupo
--           fue migrada al esquema curricular y ahora usa  g.plan_materia_id.
--           Esto causaba un error 500 al llamar  GET /inscripciones/{id}/desglose
-- =============================================================================

CREATE OR REPLACE FUNCTION academ.fn_desglose_alumno(p_inscripcion_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_resultado JSONB;
BEGIN
    SELECT jsonb_build_object(
        'inscripcion_id',          i.id,
        'alumno',                  al.nombre || ' ' || al.apellido_pat,
        'matricula',               al.matricula,
        'grupo',                   g.nombre,
        'materia',                 m.nombre,
        'periodo',                 p.codigo,
        'unidades', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'unidad_id',            u.id,
                    'numero',               u.numero,
                    'nombre',               u.nombre,
                    'estado',               u.estado,
                    'resultado_unidad',     ru.resultado_final,
                    'promedio_base',        ru.promedio_base,
                    'bonus_unidad',         ru.bonus_aplicado,
                    'desglose_actividades', ru.desglose
                )
                ORDER BY u.numero
            )
            FROM   academ.unidad u
            LEFT JOIN academ.resultado_unidad ru
                   ON ru.unidad_id = u.id AND ru.inscripcion_id = i.id
            WHERE  u.grupo_id = g.id
        ),
        'resultado_materia',       rm.resultado_final,
        'promedio_base_materia',   rm.promedio_base,
        'bonus_materia',           rm.bonus_aplicado,
        'resultado_override',      rm.resultado_override,
        'justificacion_override',  rm.justificacion_override
    )
    INTO v_resultado
    FROM   academ.inscripcion       i
    JOIN   academ.alumno            al ON al.id = i.alumno_id
    JOIN   academ.grupo             g  ON g.id  = i.grupo_id
    -- FIX: grupo ya no tiene materia_id directa; hay que pasar por plan_materia
    JOIN   academ.plan_materia      pm ON pm.id = g.plan_materia_id
    JOIN   academ.materia           m  ON m.id  = pm.materia_id
    JOIN   academ.periodo_academico p  ON p.id  = g.periodo_id
    LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
    WHERE  i.id = p_inscripcion_id;

    RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION academ.fn_desglose_alumno IS
    'Desglose completo de un alumno en un grupo. JOIN a materia vía plan_materia (esquema curricular v3+).';
