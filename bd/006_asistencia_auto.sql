-- =============================================================================
-- MIGRACIÓN 006: MÓDULO DE ASISTENCIA AUTOMATIZADA
-- =============================================================================
SET search_path = academ, public;

-- 1. Tabla de Asistencia Diaria
CREATE TABLE IF NOT EXISTS academ.asistencia (
    id          SERIAL       PRIMARY KEY,
    inscripcion_id UUID      NOT NULL REFERENCES academ.inscripcion(id) ON DELETE CASCADE,
    fecha       DATE         NOT NULL DEFAULT CURRENT_DATE,
    estado      VARCHAR(15)  NOT NULL DEFAULT 'PRESENTE', -- PRESENTE, FALTA, RETARDO, JUSTIFICADA
    observaciones TEXT,
    registrado_por UUID      REFERENCES academ.docente(id) ON DELETE SET NULL,
    ts_registro TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_asistencia_alumno_fecha UNIQUE (inscripcion_id, fecha),
    CONSTRAINT chk_asistencia_estado CHECK (estado IN ('PRESENTE','FALTA','RETARDO','JUSTIFICADA'))
);

CREATE INDEX IF NOT EXISTS idx_asistencia_insc ON academ.asistencia(inscripcion_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_fecha ON academ.asistencia(fecha);

COMMENT ON TABLE academ.asistencia IS 'Registro diario de asistencia de los alumnos.';

-- 2. Función para sincronizar asistencia con resultado_actividad automáticamente
CREATE OR REPLACE FUNCTION academ.fn_sincronizar_asistencia_automatica()
RETURNS TRIGGER AS $$
DECLARE
    v_grupo_id      UUID;
    v_actividad_id  INT;
    v_fecha_inicio  DATE;
    v_fecha_fin     DATE;
    v_total_clases  INT;
    v_presencias    FLOAT;
    v_calificacion  FLOAT;
BEGIN
    -- Obtener grupo_id del alumno afectado
    SELECT grupo_id INTO v_grupo_id FROM academ.inscripcion WHERE id = NEW.inscripcion_id;

    -- Buscar la actividad de tipo ASISTENCIA para este grupo que cubra la fecha actual
    -- Buscamos en todas las unidades del grupo
    SELECT a.id, a.fecha_apertura, a.fecha_cierre 
    INTO v_actividad_id, v_fecha_inicio, v_fecha_fin
    FROM academ.actividad a
    JOIN academ.unidad u ON u.id = a.unidad_id
    WHERE u.grupo_id = v_grupo_id 
      AND a.tipo = 'ASISTENCIA'
      AND NEW.fecha BETWEEN a.fecha_apertura AND a.fecha_cierre
    LIMIT 1;

    -- Si no hay una actividad de asistencia activa para este rango de fechas, no hacemos nada
    IF v_actividad_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Calcular estadísticas de asistencia para esta inscripción dentro del rango de la actividad
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

    -- Si hay clases registradas, calcular calificación (0-100) y actualizar resultado_actividad
    IF v_total_clases > 0 THEN
        v_calificacion := (v_presencias / v_total_clases) * 100;
        
        -- Upsert en resultado_actividad
        -- estado_entrega = 'ENTREGADA' para que cuente como procesada
        INSERT INTO academ.resultado_actividad (inscripcion_id, actividad_id, calificacion, estado_entrega, registrado_por)
        VALUES (NEW.inscripcion_id, v_actividad_id, ROUND(v_calificacion::numeric, 2), 'ENTREGADA', NEW.registrado_por)
        ON CONFLICT (inscripcion_id, actividad_id) 
        DO UPDATE SET 
            calificacion = EXCLUDED.calificacion,
            estado_entrega = 'ENTREGADA',
            fecha_modificacion = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger para actualizar al insertar o modificar asistencia
DROP TRIGGER IF EXISTS tg_asistencia_sincronizar ON academ.asistencia;
CREATE TRIGGER tg_asistencia_sincronizar
    AFTER INSERT OR UPDATE ON academ.asistencia
    FOR EACH ROW EXECUTE FUNCTION academ.fn_sincronizar_asistencia_automatica();

-- 4. Trigger para actualizar al borrar asistencia (recalcular con los datos restantes)
CREATE OR REPLACE FUNCTION academ.fn_tg_asistencia_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Ejecutamos la misma lógica usando OLD
    -- Se dispara la función de sincronización para el alumno afectado
    PERFORM academ.fn_sincronizar_asistencia_automatica_manual(OLD.inscripcion_id, OLD.fecha);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Versión de la función que recibe parámetros manuales para casos de delete
CREATE OR REPLACE FUNCTION academ.fn_sincronizar_asistencia_automatica_manual(p_insc_id UUID, p_fecha DATE)
RETURNS VOID AS $$
DECLARE
    v_grupo_id      UUID;
    v_actividad_id  INT;
    v_fecha_inicio  DATE;
    v_fecha_fin     DATE;
    v_total_clases  INT;
    v_presencias    FLOAT;
    v_calificacion  FLOAT;
BEGIN
    SELECT grupo_id INTO v_grupo_id FROM academ.inscripcion WHERE id = p_insc_id;

    SELECT a.id, a.fecha_apertura, a.fecha_cierre 
    INTO v_actividad_id, v_fecha_inicio, v_fecha_fin
    FROM academ.actividad a
    JOIN academ.unidad u ON u.id = a.unidad_id
    WHERE u.grupo_id = v_grupo_id 
      AND a.tipo = 'ASISTENCIA'
      AND p_fecha BETWEEN a.fecha_apertura AND a.fecha_cierre
    LIMIT 1;

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
            -- Si ya no quedan asistencias, borramos el resultado_actividad o lo ponemos en 0
            DELETE FROM academ.resultado_actividad WHERE inscripcion_id = p_insc_id AND actividad_id = v_actividad_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_asistencia_delete ON academ.asistencia;
CREATE TRIGGER tg_asistencia_delete
    AFTER DELETE ON academ.asistencia
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_asistencia_delete();
