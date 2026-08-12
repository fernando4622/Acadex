-- =============================================================================
-- MIGRACIÓN 003: EXPANSIÓN PARA TECNM CAMPUS VERACRUZ
-- Ejecutar DESPUÉS de database.sql (que ya incluye 001 y 002)
-- =============================================================================
SET search_path = academ, public;

-- =============================================================================
-- SECCIÓN 1: EXTENSIÓN DE TABLAS EXISTENTES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1A. periodo_academico: agregar estado y num_unidades_default
-- ---------------------------------------------------------------------------
ALTER TABLE academ.periodo_academico
    ADD COLUMN IF NOT EXISTS estado              VARCHAR(20)  NOT NULL DEFAULT 'proximo',
    ADD COLUMN IF NOT EXISTS num_unidades_default SMALLINT    NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE academ.periodo_academico
    DROP CONSTRAINT IF EXISTS chk_periodo_estado;
ALTER TABLE academ.periodo_academico
    ADD CONSTRAINT chk_periodo_estado
    CHECK (estado IN ('proximo','activo','cerrado'));

-- Trigger updated_at para periodo
CREATE OR REPLACE FUNCTION academ.fn_tg_periodo_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tg_periodo_updated_at ON academ.periodo_academico;
CREATE TRIGGER tg_periodo_updated_at
    BEFORE UPDATE ON academ.periodo_academico
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_periodo_updated_at();

-- ---------------------------------------------------------------------------
-- 1B. materia: agregar semestre, num_unidades_default, updated_at
-- ---------------------------------------------------------------------------
ALTER TABLE academ.materia
    ADD COLUMN IF NOT EXISTS semestre             SMALLINT,
    ADD COLUMN IF NOT EXISTS num_unidades_default SMALLINT    NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION academ.fn_tg_materia_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tg_materia_updated_at ON academ.materia;
CREATE TRIGGER tg_materia_updated_at
    BEFORE UPDATE ON academ.materia
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_materia_updated_at();

-- ---------------------------------------------------------------------------
-- 1C. alumno: nuevos campos de nuevo ingreso
-- ---------------------------------------------------------------------------
ALTER TABLE academ.alumno
    ADD COLUMN IF NOT EXISTS num_control       VARCHAR(12)  UNIQUE,
    ADD COLUMN IF NOT EXISTS fecha_nacimiento  DATE,
    ADD COLUMN IF NOT EXISTS curp              VARCHAR(18)  UNIQUE,
    ADD COLUMN IF NOT EXISTS semestre_actual   SMALLINT     NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS estado_ingreso    VARCHAR(30)  NOT NULL DEFAULT 'activo';

ALTER TABLE academ.alumno
    DROP CONSTRAINT IF EXISTS chk_alumno_estado_ingreso;
ALTER TABLE academ.alumno
    ADD CONSTRAINT chk_alumno_estado_ingreso
    CHECK (estado_ingreso IN ('pendiente_validacion','activo','baja','egresado'));

-- ---------------------------------------------------------------------------
-- 1D. grupo: campos de horario, aula, clave_grupo
-- ---------------------------------------------------------------------------
ALTER TABLE academ.grupo
    ADD COLUMN IF NOT EXISTS letra_grupo   VARCHAR(5),
    ADD COLUMN IF NOT EXISTS semestre      SMALLINT,
    ADD COLUMN IF NOT EXISTS horario_dias  VARCHAR(10),
    ADD COLUMN IF NOT EXISTS hora_inicio   TIME,
    ADD COLUMN IF NOT EXISTS hora_fin      TIME,
    ADD COLUMN IF NOT EXISTS aula          VARCHAR(30),
    ADD COLUMN IF NOT EXISTS clave_grupo   VARCHAR(40);

-- ---------------------------------------------------------------------------
-- 1E. actividad: nombre descriptivo + FK al catálogo de tipos + publicada
-- ---------------------------------------------------------------------------
ALTER TABLE academ.actividad
    ADD COLUMN IF NOT EXISTS nombre            VARCHAR(200),
    ADD COLUMN IF NOT EXISTS tipo_catalogo_id  INT,
    ADD COLUMN IF NOT EXISTS publicada         BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION academ.fn_tg_actividad_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tg_actividad_updated_at ON academ.actividad;
CREATE TRIGGER tg_actividad_updated_at
    BEFORE UPDATE ON academ.actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_actividad_updated_at();

-- =============================================================================
-- SECCIÓN 2: TABLAS NUEVAS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2A. tipo_actividad_catalogo — catálogo gestionado por el Admin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academ.tipo_actividad_catalogo (
    id                        SERIAL       PRIMARY KEY,
    nombre                    VARCHAR(100) NOT NULL,
    descripcion               TEXT,
    valor_ponderacion_sugerido NUMERIC(5,2),
    activo                    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tipo_actividad_nombre UNIQUE (nombre)
);

COMMENT ON TABLE academ.tipo_actividad_catalogo IS
    'Catálogo de tipos de actividad gestionado por el Administrador. Los docentes solo pueden usar tipos activos.';

CREATE OR REPLACE FUNCTION academ.fn_tg_tipo_actividad_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER tg_tipo_actividad_updated_at
    BEFORE UPDATE ON academ.tipo_actividad_catalogo
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_tipo_actividad_updated_at();

-- FK desde actividad al catálogo (ahora que la tabla existe)
ALTER TABLE academ.actividad
    DROP CONSTRAINT IF EXISTS fk_actividad_tipo_catalogo;
ALTER TABLE academ.actividad
    ADD CONSTRAINT fk_actividad_tipo_catalogo
    FOREIGN KEY (tipo_catalogo_id) REFERENCES academ.tipo_actividad_catalogo(id)
    ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2B. control_secuencial — contador atómico para num_control de alumnos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academ.control_secuencial (
    anio         SMALLINT PRIMARY KEY,
    ultimo_valor INT      NOT NULL DEFAULT 0
);

COMMENT ON TABLE academ.control_secuencial IS
    'Contador atómico por año para generación sin condiciones de carrera del num_control del alumno.';

-- ---------------------------------------------------------------------------
-- 2C. entrega_actividad — historial de entregas con versiones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academ.entrega_actividad (
    id              BIGSERIAL    PRIMARY KEY,
    inscripcion_id  UUID         NOT NULL REFERENCES academ.inscripcion(id),
    actividad_id    INT          NOT NULL REFERENCES academ.actividad(id),
    version         INT          NOT NULL DEFAULT 1,
    ruta_archivo    VARCHAR(600) NOT NULL,
    nombre_original VARCHAR(300) NOT NULL,
    extension       VARCHAR(10)  NOT NULL,
    hash_sha256     VARCHAR(64)  NOT NULL,
    tamanio_bytes   BIGINT       NOT NULL,
    ts_servidor     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_entrega_extension CHECK (
        extension IN ('pdf','docx','pptx','xls','xlsx','ppt','doc')
    )
);

CREATE INDEX IF NOT EXISTS idx_entrega_inscripcion_actividad
    ON academ.entrega_actividad(inscripcion_id, actividad_id);
CREATE INDEX IF NOT EXISTS idx_entrega_actividad
    ON academ.entrega_actividad(actividad_id);

COMMENT ON TABLE academ.entrega_actividad IS
    'Historial versionado de entregas de archivos. La versión más alta es la activa para calificar.';

-- ---------------------------------------------------------------------------
-- 2D. notificacion — badge interno (sin dependencia de correo externo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academ.notificacion (
    id          BIGSERIAL    PRIMARY KEY,
    usuario_id  UUID         NOT NULL REFERENCES academ.usuario(id) ON DELETE CASCADE,
    tipo        VARCHAR(50)  NOT NULL,
    titulo      VARCHAR(200) NOT NULL,
    mensaje     TEXT,
    leida       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_notificacion_tipo CHECK (
        tipo IN ('CAL_PUBLICADA','ENTREGA_ULTIMO_DIA','ACTIVIDAD_NUEVA','SISTEMA')
    )
);

CREATE INDEX IF NOT EXISTS idx_notificacion_usuario
    ON academ.notificacion(usuario_id, leida);

COMMENT ON TABLE academ.notificacion IS
    'Notificaciones internas (badge). Sin dependencia de correo externo.';

-- ---------------------------------------------------------------------------
-- 2E. configuracion_sistema — parámetros globales configurables por Admin
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academ.configuracion_sistema (
    clave       VARCHAR(100) PRIMARY KEY,
    valor       TEXT         NOT NULL,
    descripcion TEXT,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO academ.configuracion_sistema (clave, valor, descripcion) VALUES
    ('umbral_aprobacion', '70', 'Calificación mínima para aprobar una unidad o materia (0-100)')
ON CONFLICT (clave) DO NOTHING;

-- =============================================================================
-- SECCIÓN 3: FUNCIÓN PARA GENERACIÓN DE num_control
-- =============================================================================

CREATE OR REPLACE FUNCTION academ.fn_generar_num_control(p_anio SMALLINT)
RETURNS VARCHAR(10)
LANGUAGE plpgsql
AS $$
DECLARE
    v_siguiente INT;
    v_num_control VARCHAR(10);
BEGIN
    -- Incremento atómico con bloqueo de fila
    INSERT INTO academ.control_secuencial (anio, ultimo_valor)
    VALUES (p_anio, 1)
    ON CONFLICT (anio) DO UPDATE
        SET ultimo_valor = control_secuencial.ultimo_valor + 1
    RETURNING ultimo_valor INTO v_siguiente;

    -- Formato: [2 dígitos año][02][4 dígitos secuencial con ceros]
    v_num_control := LPAD(p_anio::TEXT, 2, '0') || '02' || LPAD(v_siguiente::TEXT, 4, '0');
    RETURN v_num_control;
END;
$$;

COMMENT ON FUNCTION academ.fn_generar_num_control IS
    'Genera num_control único en formato YYMMSSSS (ej: 26020342). Atómico y sin condiciones de carrera.';

-- =============================================================================
-- SECCIÓN 4: SEED DATA — TecNM Campus Veracruz
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4A. Tipos de actividad iniciales
-- ---------------------------------------------------------------------------
INSERT INTO academ.tipo_actividad_catalogo (nombre, descripcion, valor_ponderacion_sugerido) VALUES
    ('Examen',      'Evaluación escrita individual',           40.0),
    ('Práctica',    'Práctica de laboratorio o taller',        20.0),
    ('Proyecto',    'Proyecto integrador o de investigación',  30.0),
    ('Tarea',       'Tarea o actividad extraclase',            10.0),
    ('Exposición',  'Presentación oral ante el grupo',         20.0)
ON CONFLICT (nombre) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4B. Catálogo completo de materias TecNM Veracruz (ISC)
-- ---------------------------------------------------------------------------
INSERT INTO academ.materia (clave, nombre, semestre, num_unidades_default) VALUES
-- Semestre 1
('1J1',  'Cálculo Diferencial',                                    1, 3),
('1J2',  'Fundamentos de Programación',                            1, 3),
('1J3',  'Taller de Ética',                                        1, 2),
('1J4',  'Matemáticas Discretas',                                  1, 3),
('1J5',  'Taller de Administración',                               1, 2),
('1J6',  'Fundamentos de Investigación',                           1, 2),
('1J8',  'Tutorías I',                                             1, 1),
-- Semestre 2
('2J1',  'Cálculo Integral',                                       2, 3),
('2J2',  'Programación Orientada a Objetos',                       2, 3),
('2J3',  'Contabilidad Financiera',                                2, 2),
('2J4',  'Química',                                                2, 3),
('2J5',  'Álgebra Lineal',                                         2, 3),
('2J6',  'Probabilidad y Estadística',                             2, 3),
-- Semestre 3
('3J1',  'Cálculo Vectorial',                                      3, 3),
('3J2',  'Estructura de Datos',                                    3, 3),
('3J3',  'Cultura Empresarial',                                    3, 2),
('3J4',  'Investigación de Operaciones',                           3, 3),
('3J5',  'Sistemas Operativos',                                    3, 3),
('3J6',  'Física General',                                         3, 3),
-- Semestre 4
('4J1',  'Ecuaciones Diferenciales',                               4, 3),
('4J2',  'Métodos Numéricos',                                      4, 3),
('4J3',  'Tópicos Avanzados de Programación',                      4, 3),
('4J4',  'Fundamentos de Base de Datos',                           4, 3),
('4J5',  'Taller de Sistemas Operativos',                          4, 2),
('4J6',  'Principios Eléctricos y Aplicaciones Digitales',        4, 3),
-- Semestre 5
('5J1',  'Desarrollo Sustentable',                                 5, 2),
('5J2',  'Fundamentos de Telecomunicaciones',                      5, 3),
('5J3',  'Taller de Base de Datos',                                5, 2),
('5J4',  'Simulación',                                             5, 3),
('5J5',  'Fundamentos de Ingeniería de Software',                  5, 3),
('5J6',  'Arquitectura de Computadoras',                           5, 3),
-- Semestre 6
('6J1',  'Lenguajes y Autómatas I',                                6, 3),
('6J2',  'Redes de Computadoras',                                  6, 3),
('6J3',  'Administración de Bases de Datos',                       6, 3),
('6J4',  'Graficación',                                            6, 3),
('6J5',  'Ingeniería de Software',                                 6, 3),
('6J6',  'Lenguajes de Interfaz',                                  6, 3),
-- Semestre 7
('7J1',  'Lenguajes y Autómatas II',                               7, 3),
('7J2',  'Conmutación y Enrutamiento de Redes de Datos',           7, 3),
('7J3',  'Taller de Investigación I',                              7, 2),
('7J5',  'Gestión de Proyectos de Software',                       7, 3),
('7J6',  'Sistemas Programables',                                  7, 3),
('7J8',  'Servicio Social',                                        7, 1),
('7J12', 'Taller de Sistemas de Altas Prestaciones 1',             7, 2),
('7J14', 'Sistemas de Información',                                7, 3),
('7J15', 'Modelos y Ciencia de Datos',                             7, 3),
-- Semestre 8
('8J1',  'Programación Lógica y Funcional',                        8, 3),
('8J2',  'Administración de Redes',                                8, 3),
('8J3',  'Taller de Investigación II',                             8, 2),
('8J4',  'Programación Web',                                       8, 3),
('8J13', 'Taller de Sistemas de Altas Prestaciones 2',             8, 2),
('8J14', 'Desarrollo de Sistemas 3D Lúdicos y Educativos',         8, 3),
('8J15', 'IA en la Ciencia de Datos',                              8, 3),
('8J16', 'Bases de Datos NoSQL',                                   8, 3),
-- Semestre 9
('9J1',  'Inteligencia Artificial',                                9, 3),
('9J10', 'Blockchain en Transacciones Computacionales',            9, 3),
('9J11', 'Big Data y NoSQL',                                       9, 3)
ON CONFLICT (clave) DO UPDATE SET
    nombre                = EXCLUDED.nombre,
    semestre              = EXCLUDED.semestre,
    num_unidades_default  = EXCLUDED.num_unidades_default;

-- ---------------------------------------------------------------------------
-- 4C. Unidades plantilla para materias con 3 unidades (las más comunes)
--     Solo las que NO tengan plantilla aún
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_mat RECORD;
BEGIN
    FOR v_mat IN
        SELECT m.id, m.num_unidades_default
        FROM academ.materia m
        WHERE m.activa = TRUE
          AND NOT EXISTS (
              SELECT 1 FROM academ.unidad_plantilla up WHERE up.materia_id = m.id
          )
    LOOP
        FOR i IN 1..v_mat.num_unidades_default LOOP
            INSERT INTO academ.unidad_plantilla (materia_id, numero, nombre)
            VALUES (v_mat.id, i, 'Unidad ' || i)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4D. Periodo EJ26 (Enero-Junio 2026) como activo
--     Solo si no existe ya un periodo con ese código
-- ---------------------------------------------------------------------------
INSERT INTO academ.periodo_academico (codigo, nombre, fecha_inicio, fecha_fin, estado, num_unidades_default)
VALUES ('EJ26', 'Enero-Junio 2026', '2026-01-13', '2026-06-27', 'activo', 3)
ON CONFLICT (codigo) DO UPDATE SET
    estado = 'activo',
    nombre = EXCLUDED.nombre,
    fecha_inicio = EXCLUDED.fecha_inicio,
    fecha_fin = EXCLUDED.fecha_fin;

-- Cerrar cualquier otro periodo que estuviera activo
UPDATE academ.periodo_academico
SET estado = 'cerrado'
WHERE codigo <> 'EJ26'
  AND estado  = 'activo';

-- La cuenta administrativa inicial debe crearse de forma explícita mediante
-- backend/scripts/crear_administrador.py. Esta migración no distribuye
-- credenciales reutilizables.

-- =============================================================================
-- SECCIÓN 5: FUNCIÓN AUXILIAR — ACTIVAR PERIODO (con cierre automático)
-- =============================================================================

CREATE OR REPLACE PROCEDURE academ.sp_activar_periodo(
    p_periodo_id INT,
    p_usuario_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_activo_previo INT;
BEGIN
    -- Obtener el periodo activo actual (si existe)
    SELECT id INTO v_activo_previo
    FROM academ.periodo_academico
    WHERE estado = 'activo'
      AND id <> p_periodo_id;

    -- Cerrar el periodo activo anterior
    IF v_activo_previo IS NOT NULL THEN
        UPDATE academ.periodo_academico
        SET estado = 'cerrado', updated_at = NOW()
        WHERE id = v_activo_previo;

        PERFORM academ.fn_log_auditoria(
            'periodo_academico', v_activo_previo::TEXT, 'UPDATE',
            jsonb_build_object('estado', 'activo'),
            jsonb_build_object('estado', 'cerrado', 'cerrado_por_activacion', p_periodo_id),
            p_usuario_id, 'Cierre automático al activar nuevo periodo'
        );
    END IF;

    -- Activar el nuevo periodo
    UPDATE academ.periodo_academico
    SET estado = 'activo', updated_at = NOW()
    WHERE id = p_periodo_id;

    PERFORM academ.fn_log_auditoria(
        'periodo_academico', p_periodo_id::TEXT, 'UPDATE',
        jsonb_build_object('estado', 'proximo'),
        jsonb_build_object('estado', 'activo'),
        p_usuario_id, 'Periodo activado manualmente'
    );
END;
$$;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
DO $$
DECLARE
    v_tipos    INT;
    v_materias INT;
    v_unidades INT;
    v_periodos INT;
BEGIN
    SELECT COUNT(*) INTO v_tipos    FROM academ.tipo_actividad_catalogo;
    SELECT COUNT(*) INTO v_materias FROM academ.materia;
    SELECT COUNT(*) INTO v_unidades FROM academ.unidad_plantilla;
    SELECT COUNT(*) INTO v_periodos FROM academ.periodo_academico WHERE estado = 'activo';

    RAISE NOTICE '=== MIGRACIÓN 003 COMPLETADA ===';
    RAISE NOTICE '  Tipos de actividad     : %', v_tipos;
    RAISE NOTICE '  Materias en catálogo   : %', v_materias;
    RAISE NOTICE '  Unidades plantilla     : %', v_unidades;
    RAISE NOTICE '  Periodo activo         : %', v_periodos;
    RAISE NOTICE '================================';
END;
$$;
