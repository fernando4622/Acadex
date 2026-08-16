-- Alinea los periodos académicos con el estado vigente del backend.

DO $$
DECLARE
    estado_ya_existia BOOLEAN;
    activo_existe BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'periodo_academico'
          AND column_name = 'estado'
    ) INTO estado_ya_existia;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'periodo_academico'
          AND column_name = 'activo'
    ) INTO activo_existe;

    IF NOT estado_ya_existia THEN
        ALTER TABLE academ.periodo_academico
            ADD COLUMN estado VARCHAR(20);

        IF activo_existe THEN
            UPDATE academ.periodo_academico
            SET estado = CASE WHEN activo THEN 'activo' ELSE 'cerrado' END;
        ELSE
            UPDATE academ.periodo_academico SET estado = 'proximo';
        END IF;

        ALTER TABLE academ.periodo_academico
            ALTER COLUMN estado SET DEFAULT 'proximo',
            ALTER COLUMN estado SET NOT NULL;
    END IF;
END;
$$;

ALTER TABLE academ.periodo_academico
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    DROP CONSTRAINT IF EXISTS chk_periodo_estado,
    ADD CONSTRAINT chk_periodo_estado
        CHECK (estado IN ('proximo', 'activo', 'cerrado')),
    DROP COLUMN IF EXISTS activo;

CREATE OR REPLACE FUNCTION academ.fn_tg_periodo_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_periodo_updated_at
    ON academ.periodo_academico;
CREATE TRIGGER tg_periodo_updated_at
    BEFORE UPDATE ON academ.periodo_academico
    FOR EACH ROW
    EXECUTE FUNCTION academ.fn_tg_periodo_updated_at();

COMMENT ON COLUMN academ.periodo_academico.estado IS
    'Estado operativo vigente: proximo, activo o cerrado.';
