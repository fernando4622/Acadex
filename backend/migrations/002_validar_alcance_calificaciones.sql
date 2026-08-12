-- Impide registrar calificaciones cuando la inscripción y la actividad
-- pertenecen a grupos diferentes.
-- Ejecutar después de crear el esquema base y los objetos de control de acceso.

CREATE OR REPLACE PROCEDURE academ.sp_registrar_calificacion(
    p_inscripcion_id UUID,
    p_actividad_id   INT,
    p_calificacion   NUMERIC(6,3),
    p_estado_entrega VARCHAR(10),
    p_docente_id     UUID,
    p_motivo         TEXT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_grupo_actividad   UUID;
    v_grupo_inscripcion UUID;
    v_docente_grupo     UUID;
    v_usuario_id        UUID;
BEGIN
    SELECT u.grupo_id, g.docente_id
    INTO v_grupo_actividad, v_docente_grupo
    FROM academ.actividad a
    JOIN academ.unidad u ON u.id = a.unidad_id
    JOIN academ.grupo g ON g.id = u.grupo_id
    WHERE a.id = p_actividad_id;

    SELECT i.grupo_id
    INTO v_grupo_inscripcion
    FROM academ.inscripcion i
    WHERE i.id = p_inscripcion_id;

    IF v_grupo_actividad IS NULL OR v_grupo_inscripcion IS NULL THEN
        RAISE EXCEPTION 'Actividad o inscripción no encontrada.' USING ERRCODE = 'P0060';
    END IF;

    IF v_grupo_actividad IS DISTINCT FROM v_grupo_inscripcion THEN
        RAISE EXCEPTION 'La inscripción y la actividad no pertenecen al mismo grupo.' USING ERRCODE = 'P0060';
    END IF;

    v_usuario_id := NULLIF(current_setting('app.usuario_id', TRUE), '')::UUID;
    IF v_usuario_id IS NULL OR NOT (
        EXISTS (
            SELECT 1
            FROM academ.usuario u
            WHERE u.id = v_usuario_id
              AND 'ADMIN' = ANY(academ.fn_roles_usuario(u.id))
        )
        OR EXISTS (
            SELECT 1
            FROM academ.docente d
            WHERE d.id = v_docente_grupo
              AND d.id = p_docente_id
              AND d.usuario_id = v_usuario_id
        )
    ) THEN
        RAISE EXCEPTION 'Docente no autorizado para esta actividad.' USING ERRCODE = 'P0061';
    END IF;

    PERFORM set_config('app.motivo', COALESCE(p_motivo, ''), TRUE);

    INSERT INTO academ.resultado_actividad
        (inscripcion_id, actividad_id, calificacion, estado_entrega, registrado_por)
    VALUES
        (p_inscripcion_id, p_actividad_id, p_calificacion, p_estado_entrega, p_docente_id)
    ON CONFLICT (inscripcion_id, actividad_id) DO UPDATE SET
        calificacion       = EXCLUDED.calificacion,
        estado_entrega     = EXCLUDED.estado_entrega,
        registrado_por     = EXCLUDED.registrado_por,
        fecha_modificacion = NOW();
END;
$$;
