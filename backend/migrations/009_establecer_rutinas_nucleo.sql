-- Establece las rutinas requeridas para alumnos y periodos académicos.

CREATE TABLE IF NOT EXISTS academ.control_secuencial (
    anio         SMALLINT PRIMARY KEY,
    ultimo_valor INT      NOT NULL DEFAULT 0
);

-- Recupera el contador a partir de controles vigentes con formato YY02SSSS.
INSERT INTO academ.control_secuencial (anio, ultimo_valor)
SELECT 2000 + LEFT(no_control, 2)::SMALLINT,
       MAX(RIGHT(no_control, 4)::INT)
FROM academ.alumno
WHERE no_control ~ '^[0-9]{8}$'
  AND SUBSTRING(no_control, 3, 2) = '02'
GROUP BY LEFT(no_control, 2)
ON CONFLICT (anio) DO UPDATE
SET ultimo_valor = GREATEST(
    control_secuencial.ultimo_valor,
    EXCLUDED.ultimo_valor
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM academ.control_secuencial
        WHERE ultimo_valor < 0 OR ultimo_valor > 9999
    ) THEN
        RAISE EXCEPTION
            'El contador de números de control debe permanecer entre 0 y 9999';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'academ.control_secuencial'::regclass
          AND conname = 'chk_control_secuencial_valor'
    ) THEN
        ALTER TABLE academ.control_secuencial
            ADD CONSTRAINT chk_control_secuencial_valor
            CHECK (ultimo_valor BETWEEN 0 AND 9999);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION academ.fn_generar_num_control(p_anio SMALLINT)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    v_siguiente INT;
BEGIN
    IF p_anio NOT BETWEEN 2000 AND 2099 THEN
        RAISE EXCEPTION 'Año no válido para número de control: %', p_anio
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO academ.control_secuencial (anio, ultimo_valor)
    VALUES (p_anio, 0)
    ON CONFLICT (anio) DO NOTHING;

    UPDATE academ.control_secuencial
    SET ultimo_valor = ultimo_valor + 1
    WHERE anio = p_anio
      AND ultimo_valor < 9999
    RETURNING ultimo_valor INTO v_siguiente;

    IF v_siguiente IS NULL THEN
        RAISE EXCEPTION 'Se agotaron los números de control para el año %', p_anio
            USING ERRCODE = '22003';
    END IF;

    RETURN RIGHT(p_anio::TEXT, 2) || '02' || LPAD(v_siguiente::TEXT, 4, '0');
END;
$$;

COMMENT ON FUNCTION academ.fn_generar_num_control(SMALLINT) IS
    'Genera un no_control atómico con formato YY02SSSS para el año indicado.';

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM academ.periodo_academico WHERE estado = 'activo') > 1 THEN
        RAISE EXCEPTION
            'No se puede garantizar un periodo activo: existen varios periodos activos';
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_periodo_unico_activo
    ON academ.periodo_academico (estado)
    WHERE estado = 'activo';

CREATE OR REPLACE PROCEDURE academ.sp_activar_periodo(
    p_periodo_id INT,
    p_usuario_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_estado_objetivo VARCHAR(20);
    v_activo_previo   INT;
BEGIN
    -- Serializa activaciones concurrentes incluso cuando aún no hay periodo activo.
    PERFORM pg_advisory_xact_lock(hashtext('acadex:activar_periodo'));

    SELECT estado
    INTO v_estado_objetivo
    FROM academ.periodo_academico
    WHERE id = p_periodo_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Periodo % no encontrado', p_periodo_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_estado_objetivo = 'activo' THEN
        RETURN;
    END IF;

    SELECT id
    INTO v_activo_previo
    FROM academ.periodo_academico
    WHERE estado = 'activo'
      AND id <> p_periodo_id
    FOR UPDATE;

    IF v_activo_previo IS NOT NULL THEN
        UPDATE academ.periodo_academico
        SET estado = 'cerrado', updated_at = NOW()
        WHERE id = v_activo_previo;

        PERFORM academ.fn_log_auditoria(
            'periodo_academico', v_activo_previo::TEXT, 'UPDATE',
            jsonb_build_object('estado', 'activo'),
            jsonb_build_object(
                'estado', 'cerrado',
                'cerrado_por_activacion', p_periodo_id
            ),
            p_usuario_id, 'Cierre automático al activar nuevo periodo'
        );
    END IF;

    UPDATE academ.periodo_academico
    SET estado = 'activo', updated_at = NOW()
    WHERE id = p_periodo_id;

    PERFORM academ.fn_log_auditoria(
        'periodo_academico', p_periodo_id::TEXT, 'UPDATE',
        jsonb_build_object('estado', v_estado_objetivo),
        jsonb_build_object('estado', 'activo'),
        p_usuario_id, 'Periodo activado manualmente'
    );
END;
$$;
