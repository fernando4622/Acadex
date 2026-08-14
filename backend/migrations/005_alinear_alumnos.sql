-- Alinea alumnos con el contrato actual del backend.
-- Conserva los valores históricos al renombrar matricula como no_control.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'alumno'
          AND column_name = 'matricula'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'alumno'
          AND column_name = 'no_control'
    ) THEN
        ALTER TABLE academ.alumno RENAME COLUMN matricula TO no_control;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'alumno'
          AND column_name = 'no_control'
    ) THEN
        RAISE EXCEPTION
            'academ.alumno requiere matricula o no_control para conservar los identificadores existentes';
    END IF;
END;
$$;

ALTER TABLE academ.alumno
    ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
    ADD COLUMN IF NOT EXISTS curp VARCHAR(18),
    ADD COLUMN IF NOT EXISTS semestre_actual SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS plan_estudio_id INT REFERENCES academ.plan_estudio(id),
    ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES academ.usuario(id);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'academ.alumno'::regclass
          AND conname = 'uq_alumno_matricula'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'academ.alumno'::regclass
          AND conname = 'uq_alumno_no_control'
    ) THEN
        ALTER TABLE academ.alumno
            RENAME CONSTRAINT uq_alumno_matricula TO uq_alumno_no_control;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'academ.alumno'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) = 'UNIQUE (curp)'
    ) THEN
        ALTER TABLE academ.alumno
            ADD CONSTRAINT uq_alumno_curp UNIQUE (curp);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_alumno_no_control
    ON academ.alumno(no_control);

COMMENT ON COLUMN academ.alumno.no_control IS
    'Número de control institucional vigente del alumno.';
COMMENT ON COLUMN academ.alumno.plan_estudio_id IS
    'Plan de estudios al que pertenece actualmente el alumno.';
