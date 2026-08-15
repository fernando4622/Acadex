-- Alinea las vistas de resultados con el identificador vigente del alumno.
-- El cambio conserva los datos y las dependencias existentes porque solo renombra
-- la columna expuesta por cada vista cuando proviene de una instalacion anterior.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'v_resultados_finales'
          AND column_name = 'matricula'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'v_resultados_finales'
          AND column_name = 'no_control'
    ) THEN
        ALTER VIEW academ.v_resultados_finales
            RENAME COLUMN matricula TO no_control;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'v_resultados_parciales'
          AND column_name = 'matricula'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'v_resultados_parciales'
          AND column_name = 'no_control'
    ) THEN
        ALTER VIEW academ.v_resultados_parciales
            RENAME COLUMN matricula TO no_control;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'v_resultados_finales'
          AND column_name = 'no_control'
    ) THEN
        RAISE EXCEPTION
            'academ.v_resultados_finales no expone la columna vigente no_control';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'v_resultados_parciales'
          AND column_name = 'no_control'
    ) THEN
        RAISE EXCEPTION
            'academ.v_resultados_parciales no expone la columna vigente no_control';
    END IF;
END
$$;
