-- Adopta el nombre vigente de la rutina que genera números de control.
-- ALTER FUNCTION conserva el OID, permisos y dependencias de la función existente.

DO $$
DECLARE
    v_funcion_anterior REGPROCEDURE :=
        to_regprocedure('academ.fn_generar_num_control(smallint)');
    v_funcion_vigente REGPROCEDURE :=
        to_regprocedure('academ.fn_generar_no_control(smallint)');
BEGIN
    IF v_funcion_anterior IS NOT NULL AND v_funcion_vigente IS NOT NULL THEN
        RAISE EXCEPTION
            'Existen simultáneamente fn_generar_num_control y fn_generar_no_control; '
            'resuelva la duplicidad antes de aplicar la migración';
    END IF;

    IF v_funcion_anterior IS NOT NULL THEN
        ALTER FUNCTION academ.fn_generar_num_control(SMALLINT)
            RENAME TO fn_generar_no_control;
    END IF;

    IF to_regprocedure('academ.fn_generar_no_control(smallint)') IS NULL THEN
        RAISE EXCEPTION
            'No existe una rutina compatible para generar no_control';
    END IF;
END
$$;

COMMENT ON FUNCTION academ.fn_generar_no_control(SMALLINT) IS
    'Genera un no_control atómico con formato YY02SSSS para el año indicado.';
