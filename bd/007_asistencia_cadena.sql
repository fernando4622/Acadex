-- =============================================================================
-- MIGRACIÓN 007: ASISTENCIA POR CADENA DE UNIDADES (SIN FECHAS MANUALES)
-- =============================================================================
SET search_path = academ, public;

-- 1. Función mejorada para detectar la unidad actual por "cadena de cierre"
CREATE OR REPLACE FUNCTION academ.fn_obtener_unidad_por_fecha(p_grupo_id UUID, p_fecha DATE)
RETURNS TABLE (unidad_id INT, fecha_inicio DATE, fecha_fin DATE) AS $$
BEGIN
    RETURN QUERY
    WITH unidades_cadena AS (
        SELECT 
            u.id,
            u.numero,
            -- El inicio es el cierre de la anterior + 1 día, o el inicio del periodo si es la primera
            COALESCE(
                (SELECT (fecha_cierre::DATE + 1) 
                 FROM academ.unidad 
                 WHERE grupo_id = p_grupo_id AND numero < u.numero 
                 ORDER BY numero DESC LIMIT 1),
                (SELECT pa.fecha_inicio 
                 FROM academ.grupo g 
                 JOIN academ.periodo_academico pa ON pa.id = g.periodo_id 
                 WHERE g.id = p_grupo_id)
            ) as f_inicio,
            -- El fin es su propio cierre, o una fecha muy lejana si está abierta
            COALESCE(u.fecha_cierre::DATE, '2100-12-31'::DATE) as f_fin
        FROM academ.unidad u
        WHERE u.grupo_id = p_grupo_id
    )
    SELECT id, f_inicio, f_fin 
    FROM unidades_cadena
    WHERE p_fecha BETWEEN f_inicio AND f_fin
    ORDER BY numero ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger Refactorizado: Sincronización Automática por Cadena
CREATE OR REPLACE FUNCTION academ.fn_sincronizar_asistencia_automatica()
RETURNS TRIGGER AS $$
DECLARE
    v_grupo_id      UUID;
    v_docente_id    UUID;
    v_unidad_id     INT;
    v_fecha_inicio  DATE;
    v_fecha_fin     DATE;
    v_actividad_id  INT;
    v_total_clases  INT;
    v_presencias    FLOAT;
    v_calificacion  FLOAT;
BEGIN
    -- Obtener grupo_id y docente_id del alumno afectado
    SELECT grupo_id INTO v_grupo_id FROM academ.inscripcion WHERE id = NEW.inscripcion_id;
    SELECT docente_id INTO v_docente_id FROM academ.grupo WHERE id = v_grupo_id;

    -- 1. Identificar la unidad correspondiente por la "cadena de fechas"
    SELECT u.unidad_id, u.fecha_inicio, u.fecha_fin 
    INTO v_unidad_id, v_fecha_inicio, v_fecha_fin
    FROM academ.fn_obtener_unidad_por_fecha(v_grupo_id, NEW.fecha) u;

    -- Si no se encuentra unidad (ej. fecha fuera de periodo), salimos
    IF v_unidad_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 2. Buscar o Crear la actividad de ASISTENCIA para esa unidad
    -- Si no existe, la creamos con ponderación del 10% por defecto (ajustable por el docente luego)
    SELECT id INTO v_actividad_id 
    FROM academ.actividad 
    WHERE unidad_id = v_unidad_id AND tipo = 'ASISTENCIA' AND activa = TRUE
    LIMIT 1;

    IF v_actividad_id IS NULL THEN
        INSERT INTO academ.actividad (unidad_id, tipo, descripcion, ponderacion, orden)
        VALUES (v_unidad_id, 'ASISTENCIA', 'Asistencia Automática', 10.0, 99)
        RETURNING id INTO v_actividad_id;
    END IF;

    -- 3. Calcular estadísticas de asistencia dentro del rango detectado para la unidad
    -- Ponderación: PRESENTE=1.0, JUSTIFICADA=1.0, RETARDO=0.8, FALTA=0.0
    SELECT 
        COUNT(*),
        SUM(CASE 
            WHEN estado = 'PRESENTE' THEN 1.0 
            WHEN estado = 'JUSTIFICADA' THEN 1.0 
            WHEN estado = 'RETARDO' THEN 0.8
            ELSE 0 
        END)
    INTO v_total_clases, v_presencias
    FROM academ.asistencia
    WHERE inscripcion_id = NEW.inscripcion_id
      AND fecha BETWEEN v_fecha_inicio AND v_fecha_fin;

    -- 4. Actualizar resultado_actividad
    IF v_total_clases > 0 THEN
        v_calificacion := (v_presencias / v_total_clases) * 100;
        
        INSERT INTO academ.resultado_actividad (inscripcion_id, actividad_id, calificacion, estado_entrega, registrado_por)
        VALUES (NEW.inscripcion_id, v_actividad_id, ROUND(v_calificacion::numeric, 2), 'ENTREGADA', COALESCE(NEW.registrado_por, v_docente_id))
        ON CONFLICT (inscripcion_id, actividad_id) 
        DO UPDATE SET 
            calificacion = EXCLUDED.calificacion,
            estado_entrega = 'ENTREGADA',
            fecha_modificacion = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Función manual para recalcular (casos de borrado o ajustes masivos)
CREATE OR REPLACE FUNCTION academ.fn_sincronizar_asistencia_automatica_manual(p_insc_id UUID, p_fecha DATE)
RETURNS VOID AS $$
DECLARE
    v_grupo_id      UUID;
    v_docente_id    UUID;
    v_unidad_id     INT;
    v_fecha_inicio  DATE;
    v_fecha_fin     DATE;
    v_actividad_id  INT;
    v_total_clases  INT;
    v_presencias    FLOAT;
    v_calificacion  FLOAT;
BEGIN
    SELECT grupo_id INTO v_grupo_id FROM academ.inscripcion WHERE id = p_insc_id;
    SELECT docente_id INTO v_docente_id FROM academ.grupo WHERE id = v_grupo_id;

    SELECT u.unidad_id, u.fecha_inicio, u.fecha_fin 
    INTO v_unidad_id, v_fecha_inicio, v_fecha_fin
    FROM academ.fn_obtener_unidad_por_fecha(v_grupo_id, p_fecha) u;

    IF v_unidad_id IS NOT NULL THEN
        SELECT id INTO v_actividad_id FROM academ.actividad WHERE unidad_id = v_unidad_id AND tipo = 'ASISTENCIA' AND activa = TRUE;
        
        IF v_actividad_id IS NOT NULL THEN
            SELECT COUNT(*), SUM(CASE WHEN estado IN ('PRESENTE','JUSTIFICADA') THEN 1.0 WHEN estado = 'RETARDO' THEN 0.8 ELSE 0 END)
            INTO v_total_clases, v_presencias
            FROM academ.asistencia
            WHERE inscripcion_id = p_insc_id AND fecha BETWEEN v_fecha_inicio AND v_fecha_fin;

            IF v_total_clases > 0 THEN
                v_calificacion := (v_presencias / v_total_clases) * 100;
                UPDATE academ.resultado_actividad 
                SET calificacion = ROUND(v_calificacion::numeric, 2), fecha_modificacion = NOW()
                WHERE inscripcion_id = p_insc_id AND actividad_id = v_actividad_id;
            ELSE
                DELETE FROM academ.resultado_actividad WHERE inscripcion_id = p_insc_id AND actividad_id = v_actividad_id;
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;
