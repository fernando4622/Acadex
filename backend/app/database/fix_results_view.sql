-- -----------------------------------------------------------------------------
-- MIGRACIÓN: Corrección de umbral de aprobación en vista de resultados
-- -----------------------------------------------------------------------------
-- El umbral estándar del sistema es 70. Esta vista se asegura de que el 
-- campo 'estatus' refleje correctamente APROBADO solo si la calificación es >= 70.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW academ.v_resultados_finales AS
SELECT 
    al.nombre || ' ' || al.apellido_pat AS alumno,
    al.matricula,
    rm.inscripcion_id,
    rm.promedio_base,
    rm.bonus_aplicado AS bonus_materia,
    rm.resultado_calculado,
    rm.resultado_override,
    rm.resultado_final,
    -- Corrección: Umbral de 70 para aprobación
    CASE 
        WHEN rm.resultado_final >= 70 THEN 'APROBADO' 
        ELSE 'REPROBADO' 
    END AS estatus,
    rm.justificacion_override,
    rm.fecha_calculo,
    i.grupo_id
FROM academ.resultado_materia rm
JOIN academ.inscripcion i ON i.id = rm.inscripcion_id
JOIN academ.alumno al ON al.id = i.alumno_id;

COMMENT ON VIEW academ.v_resultados_finales IS 'Vista definitiva con el umbral de aprobación corregido a 70.';
