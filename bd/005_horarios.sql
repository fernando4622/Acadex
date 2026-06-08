-- =============================================================================
-- MIGRACIÓN 005: TABLA DE HORARIOS DETALLADA POR DÍA
-- Ejecutar DESPUÉS de 003_expansion.sql
-- =============================================================================
SET search_path = academ, public;

-- ---------------------------------------------------------------------------
-- Tabla horario_grupo: un registro por cada día de clase
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academ.horario_grupo (
    id          SERIAL       PRIMARY KEY,
    grupo_id    UUID         NOT NULL REFERENCES academ.grupo(id) ON DELETE CASCADE,
    dia_semana  VARCHAR(10)  NOT NULL,
    hora_inicio TIME,
    hora_fin    TIME,
    aula        VARCHAR(30),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_horario_dia CHECK (
        dia_semana IN ('LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO')
    ),
    CONSTRAINT uq_horario_grupo_dia UNIQUE (grupo_id, dia_semana)
);

CREATE INDEX IF NOT EXISTS idx_horario_grupo_id ON academ.horario_grupo(grupo_id);

COMMENT ON TABLE academ.horario_grupo IS 'Horario detallado por día de la semana para cada grupo académico.';

-- ---------------------------------------------------------------------------
-- Trigger para mantener consistencia updated_at en grupo al cambiar horario
-- (ya existe en grupo, no se necesita en horario)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    RAISE NOTICE '=== MIGRACIÓN 005 COMPLETADA ===';
    RAISE NOTICE '  Tabla horario_grupo creada.';
    RAISE NOTICE '================================';
END;
$$;
