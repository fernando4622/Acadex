-- Alinea materias y actividades con el catálogo vigente de tipos.

CREATE TABLE IF NOT EXISTS academ.tipo_actividad_catalogo (
    id                          SERIAL       PRIMARY KEY,
    nombre                      VARCHAR(100) NOT NULL,
    descripcion                 TEXT,
    valor_ponderacion_sugerido  NUMERIC(5,2),
    activo                      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tipo_actividad_nombre UNIQUE (nombre)
);

INSERT INTO academ.tipo_actividad_catalogo
    (nombre, descripcion, valor_ponderacion_sugerido)
VALUES
    ('Examen',        'Evaluación escrita individual',          40.0),
    ('Práctica',      'Práctica de laboratorio o taller',       20.0),
    ('Proyecto',      'Proyecto integrador o de investigación', 30.0),
    ('Tarea',         'Tarea o actividad extraclase',           10.0),
    ('Exposición',    'Presentación oral o demostración',        20.0),
    ('Investigación', 'Trabajo de investigación',                20.0),
    ('Foro',          'Discusión académica guiada',              10.0),
    ('Participación', 'Participación durante la unidad',         10.0),
    ('Asistencia',    'Registro de asistencia',                  10.0)
ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE academ.materia
    ADD COLUMN IF NOT EXISTS horas_teoria INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS horas_practica INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE academ.actividad
    ADD COLUMN IF NOT EXISTS tipo_catalogo_id INT,
    ADD COLUMN IF NOT EXISTS fecha_apertura TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'actividad'
          AND column_name = 'tipo'
    ) THEN
        EXECUTE $migracion$
            UPDATE academ.actividad a
            SET tipo_catalogo_id = catalogo.id
            FROM academ.tipo_actividad_catalogo catalogo
            WHERE a.tipo_catalogo_id IS NULL
              AND catalogo.nombre = CASE a.tipo::TEXT
                    WHEN 'EXAMEN' THEN 'Examen'
                    WHEN 'TAREA' THEN 'Tarea'
                    WHEN 'PROYECTO' THEN 'Proyecto'
                    WHEN 'PRACTICA_LAB' THEN 'Práctica'
                    WHEN 'FORO' THEN 'Foro'
                    WHEN 'PARTICIPACION' THEN 'Participación'
                    WHEN 'ASISTENCIA' THEN 'Asistencia'
                  END
        $migracion$;

        IF EXISTS (
            SELECT 1 FROM academ.actividad
            WHERE tipo IS NOT NULL AND tipo_catalogo_id IS NULL
        ) THEN
            RAISE EXCEPTION
                'Existen actividades cuyo tipo histórico no pudo convertirse al catálogo vigente';
        END IF;

        ALTER TABLE academ.actividad
            ALTER COLUMN tipo DROP NOT NULL;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'academ.actividad'::regclass
          AND conname = 'fk_actividad_tipo_catalogo'
    ) THEN
        ALTER TABLE academ.actividad
            ADD CONSTRAINT fk_actividad_tipo_catalogo
            FOREIGN KEY (tipo_catalogo_id)
            REFERENCES academ.tipo_actividad_catalogo(id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_actividad_unidad_tipo_catalogo
    ON academ.actividad(unidad_id, tipo_catalogo_id)
    WHERE activa = TRUE AND tipo_catalogo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION academ.fn_tg_catalogos_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_materia_updated_at ON academ.materia;
CREATE TRIGGER tg_materia_updated_at
    BEFORE UPDATE ON academ.materia
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_catalogos_updated_at();

DROP TRIGGER IF EXISTS tg_actividad_updated_at ON academ.actividad;
CREATE TRIGGER tg_actividad_updated_at
    BEFORE UPDATE ON academ.actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_catalogos_updated_at();

DROP TRIGGER IF EXISTS tg_tipo_actividad_updated_at
    ON academ.tipo_actividad_catalogo;
CREATE TRIGGER tg_tipo_actividad_updated_at
    BEFORE UPDATE ON academ.tipo_actividad_catalogo
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_catalogos_updated_at();
