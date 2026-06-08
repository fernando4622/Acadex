-- =============================================================================
-- SIMULACIÓN COMPLETA — FASE 4 DEL PROYECTO
-- 2 materias · 2 grupos por materia · 3 unidades · actividades distintas
-- =============================================================================
-- Prerequisitos:
--   1. schemav3.sql ejecutado
--   2. 002_rbac.sql  ejecutado
-- =============================================================================

SET search_path = academ, public;

DO $$
DECLARE
    -- Catálogos existentes desde schemav3.sql
    v_periodo_id    INT;
    v_docente_id    UUID;
    v_poo_id        INT;
    v_bd_id         INT;
    v_garcia_id     UUID;
    v_hernandez_id  UUID;
    v_torres_id     UUID;
    v_jimenez_id    UUID;
    v_ramirez_id    UUID;

    -- Rol docente
    v_rol_docente_id UUID;

    -- Grupos (Mantienen UUID)
    v_poo_a_id  UUID;
    v_poo_b_id  UUID;
    v_bd_a_id   UUID;
    v_bd_b_id   UUID;

    -- Inscripciones (Mantienen UUID)
    v_insc_garcia_poo_a     UUID;
    v_insc_hernandez_poo_a  UUID;
    v_insc_torres_poo_a     UUID;
    v_insc_jimenez_poo_b    UUID;
    v_insc_ramirez_poo_b    UUID;

    -- Unidades POO-A (Pasan a INT)
    v_poo_a_u1  INT;
    v_poo_a_u2  INT;
    v_poo_a_u3  INT;

    -- Unidades POO-B (Pasan a INT)
    v_poo_b_u1  INT;
    v_poo_b_u2  INT;
    v_poo_b_u3  INT;

    -- Actividades POO-A U1 (Pasan a INT)
    v_a_poo_a_u1_examen   INT;
    v_a_poo_a_u1_practica INT;
    v_a_poo_a_u1_tarea    INT;

    -- Actividades POO-A U2 (Pasan a INT)
    v_a_poo_a_u2_examen   INT;
    v_a_poo_a_u2_proyecto INT;

    -- Actividades POO-A U3 (Pasan a INT)
    v_a_poo_a_u3_proyecto INT;
    v_a_poo_a_u3_present  INT;

    -- Actividades POO-B U1 (Pasan a INT)
    v_a_poo_b_u1_t1   INT;
    v_a_poo_b_u1_t2   INT;
    v_a_poo_b_u1_t3   INT;
    v_a_poo_b_u1_part INT;

    -- Actividades POO-B U2 (Pasan a INT)
    v_a_poo_b_u2_examen INT;
    v_a_poo_b_u2_mapa   INT;
    v_a_poo_b_u2_quiz   INT;

    -- Actividades POO-B U3 (Pasan a INT)
    v_a_poo_b_u3_proyecto INT;
    v_a_poo_b_u3_defensa  INT;

BEGIN

-- ─── BLOQUE 1: Obtener IDs de catálogos existentes ───────────────────────────

SELECT id INTO v_periodo_id   FROM academ.periodo_academico WHERE codigo = '2024-1';
SELECT id INTO v_docente_id   FROM academ.docente            WHERE num_empleado = 'D001';
SELECT id INTO v_poo_id       FROM academ.materia            WHERE clave = 'ISC-301';
SELECT id INTO v_bd_id        FROM academ.materia            WHERE clave = 'ISC-401';
SELECT id INTO v_garcia_id    FROM academ.alumno             WHERE matricula = 'A001';
SELECT id INTO v_hernandez_id FROM academ.alumno             WHERE matricula = 'A002';
SELECT id INTO v_torres_id    FROM academ.alumno             WHERE matricula = 'A003';
SELECT id INTO v_jimenez_id   FROM academ.alumno             WHERE matricula = 'A004';
SELECT id INTO v_ramirez_id   FROM academ.alumno             WHERE matricula = 'A005';
SELECT id INTO v_rol_docente_id FROM academ.rol              WHERE nombre = 'DOCENTE';

RAISE NOTICE 'Catálogos cargados.';

-- ─── BLOQUE 2: Crear usuario del docente con su mismo UUID ───────────────────
-- El trigger fn_tg_audit_resultado_actividad guarda en auditoria_log.usuario_app
-- el valor de app.usuario_id, que sp_registrar_calificacion establece como
-- p_docente_id (el UUID del docente).
-- Para que la FK auditoria_log.usuario_app → usuario.id no falle,
-- insertamos el usuario usando exactamente el UUID del docente.

INSERT INTO academ.usuario (id, email, password_hash)
VALUES (
    v_docente_id,
    'c.martinez@escuela.edu',
	
    '$2b$12$R9h/9shS9/Ym.xT6C9G9FuV0Bx1JQBI0u2nvLm2aNIe6paEmq8kRW'
);

INSERT INTO academ.usuario_rol (usuario_id, rol_id)
VALUES (v_docente_id, v_rol_docente_id);

UPDATE academ.docente
SET usuario_id = v_docente_id
WHERE id = v_docente_id;

RAISE NOTICE 'Usuario del docente creado.';

-- ─── BLOQUE 3: Grupos ─────────────────────────────────────────────────────────

INSERT INTO academ.grupo (nombre, materia_id, docente_id, periodo_id, calificacion_maxima)
VALUES ('POO-A', v_poo_id, v_docente_id, v_periodo_id, 100) RETURNING id INTO v_poo_a_id;

INSERT INTO academ.grupo (nombre, materia_id, docente_id, periodo_id, calificacion_maxima)
VALUES ('POO-B', v_poo_id, v_docente_id, v_periodo_id, 100) RETURNING id INTO v_poo_b_id;

INSERT INTO academ.grupo (nombre, materia_id, docente_id, periodo_id, calificacion_maxima)
VALUES ('BD-A',  v_bd_id,  v_docente_id, v_periodo_id, 100) RETURNING id INTO v_bd_a_id;

INSERT INTO academ.grupo (nombre, materia_id, docente_id, periodo_id, calificacion_maxima)
VALUES ('BD-B',  v_bd_id,  v_docente_id, v_periodo_id, 100) RETURNING id INTO v_bd_b_id;

-- ─── BLOQUE 4: Inscripciones ──────────────────────────────────────────────────

INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_garcia_id,    v_poo_a_id) RETURNING id INTO v_insc_garcia_poo_a;
INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_hernandez_id, v_poo_a_id) RETURNING id INTO v_insc_hernandez_poo_a;
INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_torres_id,    v_poo_a_id) RETURNING id INTO v_insc_torres_poo_a;
INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_jimenez_id,   v_poo_b_id) RETURNING id INTO v_insc_jimenez_poo_b;
INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_ramirez_id,   v_poo_b_id) RETURNING id INTO v_insc_ramirez_poo_b;

INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_garcia_id,    v_bd_a_id);
INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_hernandez_id, v_bd_a_id);
INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_torres_id,    v_bd_a_id);
INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_jimenez_id,   v_bd_b_id);
INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES (v_ramirez_id,   v_bd_b_id);

RAISE NOTICE 'Grupos e inscripciones creados.';

-- ─── BLOQUE 5: Unidades ───────────────────────────────────────────────────────

INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_poo_a_id, 1, 'Paradigmas de POO')       RETURNING id INTO v_poo_a_u1;
INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_poo_a_id, 2, 'Herencia y Polimorfismo') RETURNING id INTO v_poo_a_u2;
INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_poo_a_id, 3, 'Patrones de Diseño')      RETURNING id INTO v_poo_a_u3;

INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_poo_b_id, 1, 'Fundamentos OO')                 RETURNING id INTO v_poo_b_u1;
INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_poo_b_id, 2, 'Abstracción y Encapsulamiento')  RETURNING id INTO v_poo_b_u2;
INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_poo_b_id, 3, 'Diseño y Arquitectura')          RETURNING id INTO v_poo_b_u3;

INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_bd_a_id, 1, 'Modelo Relacional');
INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_bd_a_id, 2, 'SQL y Consultas');
INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_bd_a_id, 3, 'Normalización y Optimización');
INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_bd_b_id, 1, 'Fundamentos de BD');
INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_bd_b_id, 2, 'Lenguaje SQL');
INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES (v_bd_b_id, 3, 'Diseño Avanzado');

-- ─── BLOQUE 6: Actividades POO-A ─────────────────────────────────────────────

INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_a_u1, 'Examen Escrito U1',   50, 1) RETURNING id INTO v_a_poo_a_u1_examen;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_a_u1, 'Práctica POO',        35, 2) RETURNING id INTO v_a_poo_a_u1_practica;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_a_u1, 'Tarea Investigación', 15, 3) RETURNING id INTO v_a_poo_a_u1_tarea;

INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_a_u2, 'Examen Herencia',   60, 1) RETURNING id INTO v_a_poo_a_u2_examen;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_a_u2, 'Proyecto Herencia', 40, 2) RETURNING id INTO v_a_poo_a_u2_proyecto;

INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_a_u3, 'Proyecto Patrones', 70, 1) RETURNING id INTO v_a_poo_a_u3_proyecto;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_a_u3, 'Presentación',      30, 2) RETURNING id INTO v_a_poo_a_u3_present;

-- ─── BLOQUE 7: Actividades POO-B (estructura completamente distinta) ──────────

INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_b_u1, 'Tarea 1',        30, 1) RETURNING id INTO v_a_poo_b_u1_t1;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_b_u1, 'Tarea 2',        30, 2) RETURNING id INTO v_a_poo_b_u1_t2;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_b_u1, 'Tarea 3',        30, 3) RETURNING id INTO v_a_poo_b_u1_t3;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_b_u1, 'Participación',   10, 4) RETURNING id INTO v_a_poo_b_u1_part;

INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_b_u2, 'Examen Práctico', 40, 1) RETURNING id INTO v_a_poo_b_u2_examen;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_b_u2, 'Mapa Conceptual', 35, 2) RETURNING id INTO v_a_poo_b_u2_mapa;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_b_u2, 'Quiz',            25, 3) RETURNING id INTO v_a_poo_b_u2_quiz;

INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_b_u3, 'Proyecto Final', 60, 1) RETURNING id INTO v_a_poo_b_u3_proyecto;
INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden) VALUES (v_poo_b_u3, 'Defensa Oral',   40, 2) RETURNING id INTO v_a_poo_b_u3_defensa;

-- Verificar ponderaciones
PERFORM 1 FROM academ.v_suma_ponderaciones
WHERE grupo_id IN (v_poo_a_id, v_poo_b_id)
  AND estructura_completa = FALSE;

IF FOUND THEN
    RAISE EXCEPTION 'ERROR: Alguna unidad no tiene ponderaciones que sumen 100%%';
END IF;

RAISE NOTICE 'OK: Todas las ponderaciones suman 100%%.';

-- ─── BLOQUE 8: Calificaciones POO-A ──────────────────────────────────────────
-- García:    8.5×0.50 + 9.0×0.35 + 10.0×0.15 = 8.90
-- Hernández: 6.5×0.50 + 7.0×0.35 + 0×0.15   = 5.70
-- Torres:    9.0×0.50 + 8.5×0.35 + 7.0×0.15  = 8.525

CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u1_examen,   85,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u1_practica, 90,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u1_tarea,    100, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u1_examen,   65, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u1_practica, 70, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u1_tarea,    0,   'NP',        v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u1_examen,   90, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u1_practica, 85, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u1_tarea,    70, 'ENTREGADA', v_docente_id);

-- Unidad 2: García=7.70  Hernández=5.40  Torres=8.40
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u2_examen,   75, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u2_proyecto, 80, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u2_examen,   50, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u2_proyecto, 60, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u2_examen,   80, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u2_proyecto, 90, 'ENTREGADA', v_docente_id);

-- Unidad 3: García=9.05  Hernández=7.15  Torres=9.70
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u3_proyecto, 95,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u3_present,  80,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u3_proyecto, 70,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u3_present,  75,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u3_proyecto, 100, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u3_present,  90,  'ENTREGADA', v_docente_id);

-- ─── BLOQUE 9: Bonus y Cierre de unidades POO-A ────────────────────────────────
-- Hernández U1: 5.70 + 0.50 = 6.20 (Se debe aplicar antes de cerrar la unidad)
CALL academ.sp_aplicar_bonus_unidad(
    v_insc_hernandez_poo_a, v_poo_a_u1,
    0.5, 'Participación extra en laboratorio',
    v_docente_id
);

CALL academ.sp_cerrar_unidad(v_poo_a_u1, v_docente_id, FALSE);
CALL academ.sp_cerrar_unidad(v_poo_a_u2, v_docente_id, FALSE);
CALL academ.sp_cerrar_unidad(v_poo_a_u3, v_docente_id, FALSE);

RAISE NOTICE 'Unidades POO-A cerradas y bonus aplicado.';

-- ─── BLOQUE 10: Sello de Materia POO-A (Flujo: ACTIVO -> PRE_CIERRE -> FINALIZADO) ──
-- García:    (8.90+7.70+9.05)/3 = 8.55
-- Hernández: (6.20+5.40+7.15)/3 = 6.25
-- Torres:    (8.525+8.40+9.70)/3 = 8.875

-- 1. Mover a PRE_CIERRE para habilitar arbitraje (Overrides / Bonus Materia)
CALL academ.sp_pre_cerrar_materia(v_poo_a_id, v_docente_id);

-- 2. Aplicar Override (Sólo permitido en PRE_CIERRE)
CALL academ.sp_override_resultado_materia(
    v_insc_torres_poo_a,
    9.0,
    'Alumno con trabajo de titulación simultáneo, ajuste según reglamento institucional artículo 45.',
    v_docente_id
);

-- 3. Sello Definitivo (FINALIZADO)
CALL academ.sp_finalizar_materia(v_poo_a_id, v_docente_id);

RAISE NOTICE 'POO-A finalizado correctamente (Pre-cierre -> Override -> Sello Final).';

-- ─── BLOQUE 12: Calificaciones y cierre POO-B ────────────────────────────────

CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u1_t1,   80, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u1_t2,   75, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u1_t3,   90, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u1_part, 85, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u1_t1,   60, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u1_t2,   70, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u1_t3,   55, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u1_part, 65, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u2_examen, 90, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u2_mapa,   80, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u2_quiz,   85, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u2_examen, 70, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u2_mapa,   65, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u2_quiz,   75, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u3_proyecto, 95, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u3_defensa,  85, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u3_proyecto, 75, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u3_defensa,  80, 'ENTREGADA', v_docente_id);

-- 3. Cierre de unidades
CALL academ.sp_cerrar_unidad(v_poo_b_u1, v_docente_id, FALSE);
CALL academ.sp_cerrar_unidad(v_poo_b_u2, v_docente_id, FALSE);
CALL academ.sp_cerrar_unidad(v_poo_b_u3, v_docente_id, FALSE);

-- 4. Pre-cierre y Sello Final
CALL academ.sp_pre_cerrar_materia(v_poo_b_id, v_docente_id);
CALL academ.sp_finalizar_materia(v_poo_b_id, v_docente_id);

RAISE NOTICE 'POO-B finalizado correctamente (Pre-cierre -> Sello Final).';
RAISE NOTICE '=== SIMULACIÓN COMPLETADA ===';

END;
$$;

-- =============================================================================
-- CONSULTAS DE VERIFICACIÓN
-- =============================================================================

SELECT '=== Q1: RESULTADOS POR UNIDAD — García POO-A ===' AS info;
SELECT u.numero, u.nombre AS unidad,
       ru.promedio_base, ru.bonus_aplicado, ru.resultado_final, ru.version
FROM academ.resultado_unidad ru
JOIN academ.unidad      u  ON u.id  = ru.unidad_id
JOIN academ.inscripcion i  ON i.id  = ru.inscripcion_id
JOIN academ.alumno      al ON al.id = i.alumno_id
JOIN academ.grupo       g  ON g.id  = i.grupo_id
WHERE al.matricula = 'A001' AND g.nombre = 'POO-A'
ORDER BY u.numero;

SELECT '=== Q2: RESULTADOS FINALES POO-A ===' AS info;
SELECT alumno, promedio_base, bonus_materia,
       resultado_calculado, resultado_override, resultado_final, estatus
FROM academ.v_resultados_finales
WHERE grupo = 'POO-A' ORDER BY alumno;

SELECT '=== Q3: HETEROGENEIDAD POO-A vs POO-B ===' AS info;
SELECT g.nombre AS grupo, u.numero, a.orden, a.nombre AS actividad, a.ponderacion
FROM academ.actividad a
JOIN academ.unidad u ON u.id = a.unidad_id
JOIN academ.grupo  g ON g.id = u.grupo_id
WHERE g.nombre IN ('POO-A','POO-B') AND a.activa = TRUE
ORDER BY g.nombre, u.numero, a.orden;

SELECT '=== Q4: IMPACTO BONUS — Hernández U1 ===' AS info;
SELECT al.nombre || ' ' || al.apellido_pat AS alumno,
       u.nombre AS unidad,
       ru.promedio_base AS sin_bonus, ru.bonus_aplicado, ru.resultado_final AS con_bonus
FROM academ.resultado_unidad ru
JOIN academ.unidad      u  ON u.id  = ru.unidad_id
JOIN academ.inscripcion i  ON i.id  = ru.inscripcion_id
JOIN academ.alumno      al ON al.id = i.alumno_id
JOIN academ.grupo       g  ON g.id  = i.grupo_id
WHERE al.matricula = 'A002' AND g.nombre = 'POO-A' AND u.numero = 1;

SELECT '=== Q5: OVERRIDE — Torres POO-A ===' AS info;
SELECT alumno, resultado_calculado, resultado_override, resultado_final, estatus
FROM academ.v_resultados_finales
WHERE matricula = 'A003' AND grupo = 'POO-A';

SELECT '=== Q6: INTEGRIDAD DE PONDERACIONES ===' AS info;
SELECT grupo_nombre, unidad_nombre, suma_ponderaciones, estructura_completa
FROM academ.v_suma_ponderaciones ORDER BY grupo_nombre, unidad_id;

SELECT '=== Q7: RESTRICCIÓN — alumno no inscrito ===' AS info;
DO $$
DECLARE v_insc UUID; v_act INT; v_doc UUID;
BEGIN
    SELECT i.id INTO v_insc FROM academ.inscripcion i
    JOIN academ.alumno al ON al.id=i.alumno_id
    JOIN academ.grupo  g  ON g.id=i.grupo_id
    WHERE al.matricula='A004' AND g.nombre='POO-B';

    SELECT a.id INTO v_act FROM academ.actividad a
    JOIN academ.unidad u ON u.id=a.unidad_id
    JOIN academ.grupo  g ON g.id=u.grupo_id
    WHERE g.nombre='POO-A' AND u.numero=1 AND a.nombre='Examen Escrito U1';

    SELECT id INTO v_doc FROM academ.docente WHERE num_empleado='D001';

    CALL academ.sp_registrar_calificacion(v_insc, v_act, 8.0, 'ENTREGADA', v_doc);
    RAISE NOTICE 'ERROR: debió haber fallado.';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OK: restricción P0003 activada -> %', SQLERRM;
END;
$$;

SELECT '=== Q8: ESTADÍSTICAS POR GRUPO ===' AS info;
SELECT grupo, materia,
       COUNT(*)                                     AS alumnos,
       ROUND(AVG(resultado_final)::NUMERIC, 2)      AS promedio,
       ROUND(MAX(resultado_final)::NUMERIC, 2)      AS mejor,
       ROUND(MIN(resultado_final)::NUMERIC, 2)      AS menor,
       COUNT(*) FILTER(WHERE estatus='APROBADO')    AS aprobados,
       COUNT(*) FILTER(WHERE estatus='REPROBADO')   AS reprobados
FROM academ.v_resultados_finales
GROUP BY grupo, materia ORDER BY grupo;



CREATE OR REPLACE VIEW academ.vw_mis_grupos AS
SELECT 
    i.alumno_id,
    g.id AS grupo_id,
    g.nombre,
    g.estado,
    g.calificacion_maxima,
    m.nombre AS materia,
    i.id AS inscripcion_id,
    i.estado AS estado_inscripcion,
    (SELECT resultado_final FROM academ.fn_calcular_resultado_materia(i.id)) AS resultado_final
FROM academ.inscripcion i
JOIN academ.grupo g ON g.id = i.grupo_id
JOIN academ.materia m ON m.id = g.materia_id;
