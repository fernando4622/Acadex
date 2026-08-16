-- =============================================================================
-- SISTEMA DE REGISTRO Y CÁLCULO DE RESULTADOS ACADÉMICOS
-- PostgreSQL 17+ / 18  —  Esquema Híbrido UUID/SERIAL
-- =============================================================================
-- Estrategia de identificadores:
--   · PKs UUID: alumno, docente, grupo, inscripcion (seguridad en APIs)
--   · PKs SERIAL: periodo, materia, unidad, actividad, resultados, bonus
--   · auditoria_log.registro_id  → TEXT (polimorfismo UUID/INT)
--   · auditoria_log.usuario_app  → UUID (FK a usuario en migración 002)
--   · alumno y docente NO tienen usuario_id aquí (se agrega en la migración 002)
-- =============================================================================
-- -----------------------------------------------------------------------------
-- 1. EXTENSIONES
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid() como alternativa
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- búsquedas sin acentos

-- -----------------------------------------------------------------------------
-- 2. ESQUEMA
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS academ;
SET search_path = academ, public;

-- =============================================================================
-- SECCIÓN A: TABLAS DE CATÁLOGOS
-- =============================================================================

-- -------------------------------------
-- A1. PERIODO ACADÉMICO
-- -------------------------------------
CREATE TABLE periodo_academico (
    id           SERIAL       PRIMARY KEY,
    codigo       VARCHAR(20)  NOT NULL,
    nombre       VARCHAR(100) NOT NULL,
    fecha_inicio DATE         NOT NULL,
    fecha_fin    DATE         NOT NULL,
    estado       VARCHAR(20)  NOT NULL DEFAULT 'proximo',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_periodo_codigo  UNIQUE (codigo),
    CONSTRAINT chk_periodo_fechas CHECK (fecha_fin > fecha_inicio),
    CONSTRAINT chk_periodo_estado CHECK (estado IN ('proximo','activo','cerrado'))
);

COMMENT ON TABLE  periodo_academico        IS 'Periodos académicos (semestres, cuatrimestres, etc.)';
COMMENT ON COLUMN periodo_academico.codigo IS 'Clave única del periodo, ej: 2024-1, 2024A';

CREATE UNIQUE INDEX uq_periodo_unico_activo
    ON periodo_academico (estado)
    WHERE estado = 'activo';

-- -------------------------------------
-- A2. CARRERA Y PLAN DE ESTUDIO
-- -------------------------------------
CREATE TABLE carrera (
    id          SERIAL       PRIMARY KEY,
    clave       VARCHAR(10)  NOT NULL UNIQUE,
    nombre      VARCHAR(150) NOT NULL,
    descripcion TEXT,
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE plan_estudio (
    id         SERIAL    PRIMARY KEY,
    carrera_id INT       NOT NULL REFERENCES carrera(id),
    nombre     TEXT      NOT NULL,
    vigente    BOOLEAN   DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE carrera IS
    'Catálogo institucional de carreras o programas académicos.';
COMMENT ON TABLE plan_estudio IS
    'Versiones de planes de estudio pertenecientes a una carrera.';

-- -------------------------------------
-- A3. ALUMNO
-- usuario_id se agrega en la migración 002_rbac.sql mediante ALTER TABLE
-- -------------------------------------
CREATE TABLE alumno (
    id           UUID         PRIMARY KEY DEFAULT uuidv7(),
    no_control   VARCHAR(12)  NOT NULL,
    nombre       VARCHAR(100) NOT NULL,
    apellido_pat VARCHAR(100) NOT NULL,
    apellido_mat VARCHAR(100),
    fecha_nacimiento DATE,
    curp         VARCHAR(18),
    email        VARCHAR(150),
    semestre_actual SMALLINT  NOT NULL DEFAULT 1,
    plan_estudio_id INT       REFERENCES plan_estudio(id),
    activo       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_alumno_no_control UNIQUE (no_control),
    CONSTRAINT uq_alumno_curp       UNIQUE (curp),
    CONSTRAINT uq_alumno_email     UNIQUE (email),
    CONSTRAINT chk_alumno_email    CHECK (
        email IS NULL OR
        email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
    )
);

COMMENT ON TABLE alumno IS 'Catálogo de alumnos de la institución';

-- Contador atómico anual para generar no_control con formato YY02SSSS.
CREATE TABLE control_secuencial (
    anio         SMALLINT PRIMARY KEY,
    ultimo_valor INT      NOT NULL DEFAULT 0,

    CONSTRAINT chk_control_secuencial_valor
        CHECK (ultimo_valor BETWEEN 0 AND 9999)
);

-- -------------------------------------
-- A4. DOCENTE
-- usuario_id se agrega en la migración 002_rbac.sql mediante ALTER TABLE
-- -------------------------------------
CREATE TABLE docente (
    id           UUID         PRIMARY KEY DEFAULT uuidv7(),
    num_empleado VARCHAR(8)  NOT NULL,
    nombre       VARCHAR(100) NOT NULL,
    apellido_pat VARCHAR(100) NOT NULL,
    apellido_mat VARCHAR(100),
    email        VARCHAR(150) NOT NULL,
    activo       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_docente_num_empleado UNIQUE (num_empleado),
    CONSTRAINT uq_docente_email        UNIQUE (email),
    CONSTRAINT chk_docente_email       CHECK (
        email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
    )
);

COMMENT ON TABLE docente IS 'Catálogo de docentes de la institución';

-- -------------------------------------
-- A5. MATERIA
-- -------------------------------------
CREATE TABLE materia (
    id             SERIAL       PRIMARY KEY,
    clave          VARCHAR(8)   NOT NULL,
    nombre         VARCHAR(200) NOT NULL,
    creditos       SMALLINT     CHECK (creditos > 0),
    horas_teoria   INT          DEFAULT 0,
    horas_practica INT          DEFAULT 0,
    activa         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_materia_clave UNIQUE (clave)
);

COMMENT ON TABLE materia IS 'Catálogo de materias/asignaturas';

-- -------------------------------------
-- A6. MATERIAS DE UN PLAN DE ESTUDIO
-- -------------------------------------
CREATE TABLE plan_materia (
    id               SERIAL    PRIMARY KEY,
    plan_estudio_id   INT       NOT NULL REFERENCES plan_estudio(id),
    materia_id        INT       NOT NULL REFERENCES materia(id),
    clave             TEXT      NOT NULL,
    semestre          INT       NOT NULL,
    orden             INT       DEFAULT 0,
    obligatoria       BOOLEAN   DEFAULT TRUE,
    creditos_override INT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_plan_materia_clave
        UNIQUE (plan_estudio_id, clave),
    CONSTRAINT uq_plan_materia_materia
        UNIQUE (plan_estudio_id, materia_id)
);

COMMENT ON TABLE plan_materia IS
    'Materias incluidas en un plan, con su clave, semestre y orden curricular.';

-- =============================================================================
-- SECCIÓN B: ESTRUCTURA ACADÉMICA
-- =============================================================================

-- -------------------------------------
-- B1. GRUPO
-- calificacion_maxima: escala de la institución (ej. 10 o 100)
-- -------------------------------------
CREATE TABLE grupo (
    id                  UUID         PRIMARY KEY DEFAULT uuidv7(),
    nombre              VARCHAR(50)  NOT NULL,
    plan_materia_id     INT          NOT NULL REFERENCES plan_materia(id),
    docente_id          UUID         NOT NULL REFERENCES docente(id),
    periodo_id          INT          NOT NULL REFERENCES periodo_academico(id),
    calificacion_maxima NUMERIC(6,3) NOT NULL DEFAULT 100.00,
    estado              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
    letra_grupo         VARCHAR(5),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_grupo_estado                CHECK (estado IN ('ACTIVO','PRECIERRE','FINALIZADO')),
    CONSTRAINT chk_grupo_cal_max               CHECK (calificacion_maxima > 0)
);

COMMENT ON TABLE  grupo                     IS 'Grupos académicos (instancia de materia en un periodo)';
COMMENT ON COLUMN grupo.calificacion_maxima IS 'Calificación máxima permitida, define la escala del grupo';

-- -------------------------------------
-- B2. UNIDAD
-- Una unidad pertenece a un grupo específico (NO es global)
-- -------------------------------------
CREATE TABLE unidad (
    id           SERIAL      PRIMARY KEY,
    grupo_id     UUID        NOT NULL REFERENCES grupo(id),
    numero       SMALLINT    NOT NULL,
    nombre       VARCHAR(200) NOT NULL,
    estado       VARCHAR(20) NOT NULL DEFAULT 'EDICION',
    fecha_cierre TIMESTAMPTZ,
    cerrado_por  UUID        REFERENCES docente(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_unidad_grupo_numero  UNIQUE (grupo_id, numero),
    CONSTRAINT chk_unidad_numero       CHECK (numero > 0),
    CONSTRAINT chk_unidad_estado       CHECK (estado IN ('EDICION','CERRADA','FINALIZADA')),
    -- Si está cerrada debe tener fecha y responsable
    CONSTRAINT chk_unidad_cierre_consistente CHECK (
        (estado = 'EDICION'
            AND fecha_cierre IS NULL
            AND cerrado_por  IS NULL)
        OR
        (estado IN ('CERRADA','FINALIZADA')
            AND fecha_cierre IS NOT NULL
            AND cerrado_por  IS NOT NULL)
    )
);

COMMENT ON TABLE  unidad        IS 'Unidades académicas de un grupo. Cada grupo tiene su propia estructura.';
COMMENT ON COLUMN unidad.estado IS 'EDICION: acepta cambios. CERRADA: resultados persistidos. FINALIZADA: solo lectura.';

-- -------------------------------------
-- B2. UNIDAD_PLANTILLA 
-- Util para tener modelos ya creados y cargarlos dentro de las materias de los grupos creados
-- -------------------------------------
CREATE TABLE IF NOT EXISTS academ.unidad_plantilla (
    id         SERIAL       PRIMARY KEY,
    materia_id INT          NOT NULL REFERENCES academ.materia(id),
    numero     SMALLINT     NOT NULL,
    nombre     VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_unidad_plantilla_materia_numero UNIQUE (materia_id, numero),
    CONSTRAINT chk_unidad_plantilla_numero         CHECK (numero > 0)
);

COMMENT ON TABLE academ.unidad_plantilla IS
    'Plantilla de unidades por materia. Al crear un grupo, estas unidades se copian automáticamente.';
-- -----------------------------------------------------------------------------
-- 2. Índice para búsquedas rápidas por materia
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_unidad_plantilla_materia ON academ.unidad_plantilla(materia_id);

-- -------------------------------------
-- B3. TIPO DE ACTIVIDAD
-- Catálogo extensible utilizado por las actividades evaluables.
-- -------------------------------------
CREATE TABLE tipo_actividad_catalogo (
    id                          SERIAL       PRIMARY KEY,
    nombre                      VARCHAR(100) NOT NULL,
    descripcion                 TEXT,
    valor_ponderacion_sugerido  NUMERIC(5,2),
    activo                      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tipo_actividad_nombre UNIQUE (nombre)
);

INSERT INTO tipo_actividad_catalogo
    (nombre, descripcion, valor_ponderacion_sugerido)
VALUES
    ('Examen',        'Evaluación escrita individual',          40.0),
    ('Práctica',      'Práctica de laboratorio o taller',       20.0),
    ('Proyecto',      'Proyecto integrador o de investigación', 30.0),
    ('Tarea',         'Tarea o actividad extraclase',           10.0),
    ('Exposición',    'Presentación oral o demostración',        20.0),
    ('Participación', 'Participación durante la unidad',         10.0),
    ('Investigación', 'Trabajo de investigación',                20.0),
    ('Foro',          'Discusión académica guiada',              10.0),
    ('Asistencia',    'Registro de asistencia',                  10.0);

-- -------------------------------------
-- B4. ACTIVIDAD
-- Existe SOLO en el contexto de una unidad de un grupo.
-- La ponderación pertenece a la actividad (que ya es contextual).
-- -------------------------------------
CREATE TABLE actividad (
    id               SERIAL        PRIMARY KEY,
    unidad_id        INT           NOT NULL REFERENCES unidad(id),
    tipo_catalogo_id INT           REFERENCES tipo_actividad_catalogo(id) ON DELETE RESTRICT,
    descripcion    VARCHAR(200),
    ponderacion    NUMERIC(6,3)           NOT NULL,   -- 0.001 a 100.000
    fecha_apertura TIMESTAMPTZ,
    fecha_cierre   TIMESTAMPTZ,
    activa         BOOLEAN                NOT NULL DEFAULT TRUE,
    publicada      BOOLEAN                NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ            NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_actividad_ponderacion CHECK (ponderacion > 0 AND ponderacion <= 100)
);

-- Unicidad de tipo por unidad (solo para activas)
CREATE UNIQUE INDEX uq_actividad_unidad_tipo_catalogo
    ON actividad (unidad_id, tipo_catalogo_id)
    WHERE activa = TRUE AND tipo_catalogo_id IS NOT NULL;

COMMENT ON TABLE  actividad             IS 'Actividades evaluables. Solo existen dentro del contexto unidad→grupo.';
COMMENT ON COLUMN actividad.ponderacion IS 'Porcentaje que representa esta actividad en la unidad (0 < p <= 100)';
COMMENT ON COLUMN actividad.activa      IS 'Baja lógica: FALSE si fue eliminada después de tener calificaciones';

-- =============================================================================
-- SECCIÓN C: INSCRIPCIONES
-- =============================================================================

CREATE TABLE inscripcion (
    id                UUID        PRIMARY KEY DEFAULT uuidv7(),
    alumno_id         UUID        NOT NULL REFERENCES alumno(id),
    grupo_id          UUID        NOT NULL REFERENCES grupo(id),
    fecha_inscripcion DATE        NOT NULL DEFAULT CURRENT_DATE,
    estado            VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_inscripcion_alumno_grupo UNIQUE (alumno_id, grupo_id),
    CONSTRAINT chk_inscripcion_estado      CHECK (estado IN ('ACTIVA','BAJA','BAJA_DEFINITIVA'))
);

COMMENT ON TABLE inscripcion IS 'Relación formal alumno-grupo. Sin inscripción activa no puede haber resultados.';

-- =============================================================================
-- SECCIÓN D: RESULTADOS POR ACTIVIDAD
-- =============================================================================

CREATE TABLE resultado_actividad (
    id                 SERIAL      PRIMARY KEY,
    inscripcion_id     UUID        NOT NULL REFERENCES inscripcion(id),
    actividad_id       INT         NOT NULL REFERENCES actividad(id),
    calificacion       NUMERIC(6,3),               -- NULL solo si aún no se registra
    estado_entrega     VARCHAR(10) NOT NULL DEFAULT 'NP',
    registrado_por     UUID        NOT NULL REFERENCES docente(id),
    fecha_registro     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_modificacion TIMESTAMPTZ,

    CONSTRAINT uq_resultado_inscripcion_actividad UNIQUE (inscripcion_id, actividad_id),
    CONSTRAINT chk_resultado_estado_entrega       CHECK (estado_entrega IN ('ENTREGADA','NP','EXENTO')),
    -- La calificación debe estar en el rango del grupo (se valida vía trigger)
    CONSTRAINT chk_resultado_calificacion_no_neg  CHECK (calificacion IS NULL OR calificacion >= 0)
);

COMMENT ON TABLE  resultado_actividad               IS 'Calificación de un alumno en una actividad específica';
COMMENT ON COLUMN resultado_actividad.estado_entrega IS 'ENTREGADA=calificación real, NP=no presentó (cuenta como 0), EXENTO=no aplica';

-- =============================================================================
-- SECCIÓN E: BONUS
-- =============================================================================

-- Bonus individual por alumno por unidad
CREATE TABLE bonus_unidad (
    id               SERIAL       PRIMARY KEY,
    inscripcion_id   UUID         NOT NULL REFERENCES inscripcion(id),
    unidad_id        INT          NOT NULL REFERENCES unidad(id),
    monto            NUMERIC(6,3) NOT NULL DEFAULT 0,
    justificacion    VARCHAR(500),
    aplicado_por     UUID         NOT NULL REFERENCES docente(id),
    fecha_aplicacion TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_bonus_unidad_inscripcion UNIQUE (inscripcion_id, unidad_id),
    CONSTRAINT chk_bonus_unidad_monto_pos  CHECK (monto >= 0)
);

COMMENT ON TABLE bonus_unidad IS 'Puntos extra otorgados a un alumno específico en una unidad específica';

-- Bonus individual por alumno a nivel materia (grupo)
CREATE TABLE bonus_materia (
    id               SERIAL       PRIMARY KEY,
    inscripcion_id   UUID         NOT NULL REFERENCES inscripcion(id) UNIQUE,
    monto            NUMERIC(6,3) NOT NULL DEFAULT 0,
    justificacion    VARCHAR(500),
    aplicado_por     UUID         NOT NULL REFERENCES docente(id),
    fecha_aplicacion TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_bonus_materia_monto_pos CHECK (monto >= 0)
);

COMMENT ON TABLE bonus_materia IS 'Puntos extra aplicados al resultado final de materia de un alumno';

-- =============================================================================
-- SECCIÓN F: RESULTADOS CALCULADOS (SNAPSHOTS)
-- =============================================================================

-- Snapshot del resultado por unidad (se persiste al cerrar la unidad)
CREATE TABLE resultado_unidad (
    id              SERIAL       PRIMARY KEY,
    inscripcion_id  UUID         NOT NULL REFERENCES inscripcion(id),
    unidad_id       INT          NOT NULL REFERENCES unidad(id),
    promedio_base   NUMERIC(8,4) NOT NULL,   -- suma ponderada sin bonus
    bonus_aplicado  NUMERIC(6,3) NOT NULL DEFAULT 0,
    resultado_final NUMERIC(8,4) NOT NULL,   -- con bonus, con tope
    desglose        JSONB,                    -- detalle auditadle
    fecha_calculo   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    version         INT          NOT NULL DEFAULT 1,

    CONSTRAINT uq_resultado_unidad_insc   UNIQUE (inscripcion_id, unidad_id),
    CONSTRAINT chk_resultado_unidad_base  CHECK (promedio_base  >= 0),
    CONSTRAINT chk_resultado_unidad_final CHECK (resultado_final >= 0)
);

COMMENT ON COLUMN resultado_unidad.desglose IS 'JSON con el detalle de cada actividad, su peso y calificación usada en el cálculo';
COMMENT ON COLUMN resultado_unidad.version  IS 'Incrementa cada vez que se recalcula por modificación posterior al cierre';

-- Snapshot del resultado final de materia
CREATE TABLE resultado_materia (
    id                     SERIAL       PRIMARY KEY,
    inscripcion_id         UUID         NOT NULL REFERENCES inscripcion(id) UNIQUE,
    promedio_base          NUMERIC(8,4) NOT NULL,   -- promedio de unidades sin bonus materia
    bonus_aplicado         NUMERIC(6,3) NOT NULL DEFAULT 0,
    resultado_calculado    NUMERIC(8,4) NOT NULL,   -- con bonus materia, con tope
    resultado_override     NUMERIC(6,3),             -- override manual del docente
    justificacion_override VARCHAR(500),
    resultado_final        NUMERIC(8,4) NOT NULL,   -- el publicado (override o calculado)
    override_por           UUID         REFERENCES docente(id),
    fecha_override         TIMESTAMPTZ,
    fecha_calculo          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    version                INT          NOT NULL DEFAULT 1
);

COMMENT ON COLUMN resultado_materia.resultado_override IS 'Si el docente decide cambiar el resultado calculado, se registra aquí con justificación';
COMMENT ON COLUMN resultado_materia.resultado_final    IS 'Valor publicado: resultado_override si existe, resultado_calculado si no';

-- =============================================================================
-- SECCIÓN G: AUDITORÍA — INMUTABLE
-- registro_id  : TEXT para soportar polimorfismo SERIAL(INT) y UUID
-- usuario_app  : UUID del usuario que ejecutó la acción (FK se agrega en 002_rbac.sql)
-- =============================================================================

CREATE TABLE auditoria_log (
    id             BIGSERIAL    PRIMARY KEY,   -- BIGSERIAL: append-only, no necesita UUID opaco
    esquema        VARCHAR(50)  NOT NULL DEFAULT 'academ',
    tabla          VARCHAR(100) NOT NULL,
    registro_id    TEXT,                        -- TEXT: soporta tanto IDs SERIAL como UUID
    operacion      VARCHAR(30)  NOT NULL,
    valor_anterior JSONB,
    valor_nuevo    JSONB,
    usuario_db     TEXT         NOT NULL DEFAULT CURRENT_USER,
    usuario_app    UUID,                        -- FK a usuario se agrega en 002_rbac.sql
    ip_cliente     INET,
    motivo         VARCHAR(500),
    ts             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_auditoria_operacion CHECK (
        operacion IN (
            'INSERT','UPDATE','DELETE',
            'BONUS_APLICADO','BONUS_MODIFICADO',
            'OVERRIDE_APLICADO','UNIDAD_CERRADA',
            'MATERIA_PRECIERRE','MATERIA_FINALIZADA','RECALCULO',
            'UNIDAD_ELIMINADA',
            'ROL_ASIGNADO','ROL_REVOCADO'       -- se usan desde la migración 002
        )
    )
);

-- Auditoría NO debe poder modificarse ni eliminarse desde la app
ALTER TABLE auditoria_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_insert_only ON auditoria_log FOR INSERT WITH CHECK (TRUE);
CREATE POLICY audit_no_update   ON auditoria_log FOR UPDATE USING (FALSE);
CREATE POLICY audit_no_delete   ON auditoria_log FOR DELETE USING (FALSE);

COMMENT ON TABLE auditoria_log IS 'Log inmutable de todas las operaciones críticas del sistema';

-- =============================================================================
-- SECCIÓN H: ÍNDICES
-- UUIDv7 es ordenable por tiempo → los índices B-tree son igual de eficientes que con SERIAL
-- =============================================================================

-- Búsqueda de alumnos por matrícula o nombre
CREATE INDEX idx_alumno_no_control ON alumno(no_control);
CREATE INDEX idx_alumno_nombre    ON alumno USING gin(to_tsvector('spanish', nombre || ' ' || apellido_pat));

-- Grupos
CREATE INDEX idx_grupo_plan_materia ON grupo(plan_materia_id);
CREATE INDEX idx_grupo_docente ON grupo(docente_id);
CREATE INDEX idx_grupo_periodo ON grupo(periodo_id);

-- Unidades
CREATE INDEX idx_unidad_grupo  ON unidad(grupo_id);
CREATE INDEX idx_unidad_estado ON unidad(estado);

-- Actividades
CREATE INDEX idx_actividad_unidad ON actividad(unidad_id);
CREATE INDEX idx_actividad_activa ON actividad(unidad_id) WHERE activa = TRUE;

-- Inscripciones
CREATE INDEX idx_inscripcion_alumno  ON inscripcion(alumno_id);
CREATE INDEX idx_inscripcion_grupo   ON inscripcion(grupo_id);
CREATE INDEX idx_inscripcion_activa  ON inscripcion(grupo_id) WHERE estado = 'ACTIVA';

-- Resultados por actividad
CREATE INDEX idx_res_act_inscripcion ON resultado_actividad(inscripcion_id);
CREATE INDEX idx_res_act_actividad   ON resultado_actividad(actividad_id);

-- Bonus
CREATE INDEX idx_bonus_unidad_insc  ON bonus_unidad(inscripcion_id);
CREATE INDEX idx_bonus_materia_insc ON bonus_materia(inscripcion_id);

-- Resultados snapshot
CREATE INDEX idx_res_unidad_insc   ON resultado_unidad(inscripcion_id);
CREATE INDEX idx_res_unidad_unidad ON resultado_unidad(unidad_id);

-- Auditoría
CREATE INDEX idx_audit_tabla_id  ON auditoria_log(tabla, registro_id);
CREATE INDEX idx_audit_ts        ON auditoria_log(ts DESC);
CREATE INDEX idx_audit_usuario   ON auditoria_log(usuario_app);

-- =============================================================================
-- SECCIÓN I: FUNCIONES AUXILIARES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F01: Registrar en auditoría (uso interno de triggers y procedures)
-- p_usuario_app recibe UUID; la FK a usuario se aplica en 002_rbac.sql
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_log_auditoria(
    p_tabla        TEXT,
    p_registro_id  TEXT,
    p_operacion    TEXT,
    p_anterior     JSONB,
    p_nuevo        JSONB,
    p_usuario_app  UUID    DEFAULT NULL,
    p_motivo       TEXT    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO academ.auditoria_log
        (tabla, registro_id, operacion, valor_anterior, valor_nuevo, usuario_app, motivo)
    VALUES
        (p_tabla, p_registro_id, p_operacion, p_anterior, p_nuevo, p_usuario_app, p_motivo);
END;
$$;

-- -----------------------------------------------------------------------------
-- F02: Generar no_control institucional sin condiciones de carrera
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- F02: Calcular suma de ponderaciones activas de una unidad
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_suma_ponderaciones(p_unidad_id INT)
RETURNS NUMERIC(8,3)
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(ponderacion), 0)
    FROM   academ.actividad
    WHERE  unidad_id = p_unidad_id
      AND  activa    = TRUE;
$$;

COMMENT ON FUNCTION academ.fn_suma_ponderaciones IS
    'Retorna la suma de ponderaciones de las actividades activas de una unidad';

-- -----------------------------------------------------------------------------
-- F03: Verificar que un alumno está inscrito activamente en el grupo
--      al que pertenece la actividad indicada
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_alumno_inscrito_en_grupo_de_actividad(
    p_inscripcion_id UUID,
    p_actividad_id   INT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   academ.inscripcion i
        JOIN   academ.actividad   a ON a.id = p_actividad_id
        JOIN   academ.unidad      u ON u.id = a.unidad_id
        WHERE  i.id       = p_inscripcion_id
          AND  i.grupo_id = u.grupo_id
          AND  i.estado   = 'ACTIVA'
    );
$$;

-- -----------------------------------------------------------------------------
-- F04: Calcular promedio ponderado de una inscripción en una unidad
--      Retorna: (promedio_base, bonus, resultado_final, desglose JSONB)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_calcular_resultado_unidad(
    p_inscripcion_id UUID,
    p_unidad_id      INT
)
RETURNS TABLE (
    promedio_base   NUMERIC(8,4),
    bonus_aplicado  NUMERIC(6,3),
    resultado_final NUMERIC(8,4),
    desglose        JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cal_max  NUMERIC(6,3);
    v_bonus    NUMERIC(6,3) := 0;
    v_base     NUMERIC(8,4) := 0;
    v_final    NUMERIC(8,4);
    v_desglose JSONB;
    v_count    INT;
BEGIN
    SELECT g.calificacion_maxima
    INTO   v_cal_max
    FROM   academ.inscripcion i
    JOIN   academ.grupo       g ON g.id = i.grupo_id
    WHERE  i.id = p_inscripcion_id;

    SELECT
        SUM(COALESCE(ra.calificacion, 0) * (a.ponderacion / 100.0)),
        COUNT(ra.calificacion)
    INTO v_base, v_count
    FROM   academ.actividad a
    LEFT JOIN academ.resultado_actividad ra
           ON ra.actividad_id   = a.id
          AND ra.inscripcion_id = p_inscripcion_id
    WHERE  a.unidad_id = p_unidad_id
      AND  a.activa    = TRUE;

    IF v_count = 0 THEN
        v_base := NULL;
    END IF;

    SELECT COALESCE(monto, 0)
    INTO   v_bonus
    FROM   academ.bonus_unidad
    WHERE  inscripcion_id = p_inscripcion_id
      AND  unidad_id      = p_unidad_id;

    v_bonus := COALESCE(v_bonus, 0);

    v_final := LEAST(COALESCE(v_base, 0) + v_bonus, v_cal_max);

    SELECT jsonb_agg(
        jsonb_build_object(
            'actividad_id',   a.id,
            'tipo_nombre',    c.nombre,
            'ponderacion',    a.ponderacion,
            'calificacion',   COALESCE(ra.calificacion, 0),
            'estado_entrega', COALESCE(ra.estado_entrega, 'NP'),
            'contribucion',   ROUND(COALESCE(ra.calificacion, 0) * (a.ponderacion / 100.0), 6)
        )
        ORDER BY a.ponderacion DESC
    )
    INTO v_desglose
    FROM academ.actividad a
    LEFT JOIN academ.tipo_actividad_catalogo c ON a.tipo_catalogo_id = c.id
    LEFT JOIN academ.resultado_actividad ra
           ON ra.actividad_id   = a.id
          AND ra.inscripcion_id = p_inscripcion_id
    WHERE  a.unidad_id = p_unidad_id
      AND  a.activa    = TRUE;

    RETURN QUERY SELECT v_base, v_bonus, v_final, v_desglose;
END;
$$;

COMMENT ON FUNCTION academ.fn_calcular_resultado_unidad IS
    'Calcula el resultado de un alumno en una unidad: promedio base + bonus + tope. Retorna desglose para auditoría.';

-- -----------------------------------------------------------------------------
-- F05: Calcular resultado final de materia para una inscripción
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_calcular_resultado_materia(
    p_inscripcion_id UUID
)
RETURNS TABLE (
    promedio_base       NUMERIC(8,4),
    bonus_aplicado      NUMERIC(6,3),
    resultado_calculado NUMERIC(8,4),
    resultado_final     NUMERIC(8,4),
    unidades_totales    INT,
    unidades_con_result INT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cal_max         NUMERIC(6,3);
    v_bonus_mat       NUMERIC(6,3) := 0;
    v_promedio_base   NUMERIC(8,4);
    v_calculado       NUMERIC(8,4);
    v_override        NUMERIC(6,3);
    v_final           NUMERIC(8,4);
    v_total_unidades  INT;
    v_unid_con_result INT;
BEGIN
    -- Escala máxima
    SELECT g.calificacion_maxima
    INTO   v_cal_max
    FROM   academ.inscripcion i
    JOIN   academ.grupo       g ON g.id = i.grupo_id
    WHERE  i.id = p_inscripcion_id;

    -- Total de unidades del grupo
    SELECT COUNT(*)
    INTO   v_total_unidades
    FROM   academ.unidad u
    JOIN   academ.inscripcion i ON i.grupo_id = u.grupo_id
    WHERE  i.id = p_inscripcion_id;

    -- Promedio de unidades (unidades sin snapshot cuentan como 0)
    SELECT COUNT(ru.id),
           COALESCE(SUM(ru.resultado_final), 0) / NULLIF(COUNT(ru.id), 0)
    INTO   v_unid_con_result, v_promedio_base
    FROM   academ.unidad u
    JOIN   academ.inscripcion i ON i.grupo_id = u.grupo_id
    LEFT JOIN academ.resultado_unidad ru
           ON ru.unidad_id      = u.id
          AND ru.inscripcion_id = p_inscripcion_id
    WHERE  i.id = p_inscripcion_id;

    -- Si no hay ninguna unidad con resultado, retornamos todo como NULL
    -- para indicar que la materia está pendiente de evaluación inicial.
    IF v_unid_con_result = 0 OR v_unid_con_result IS NULL THEN
        RETURN QUERY SELECT
            NULL::NUMERIC, -- promedio_base
            NULL::NUMERIC, -- bonus_aplicado
            NULL::NUMERIC, -- resultado_calculado
            NULL::NUMERIC, -- resultado_final
            v_total_unidades,
            0;
        RETURN;
    END IF;

    v_promedio_base := COALESCE(v_promedio_base, 0);

    -- Bonus de materia
    SELECT COALESCE(monto, 0)
    INTO   v_bonus_mat
    FROM   academ.bonus_materia
    WHERE  inscripcion_id = p_inscripcion_id;

    v_bonus_mat := COALESCE(v_bonus_mat, 0);

    v_calculado := LEAST(v_promedio_base + v_bonus_mat, v_cal_max);

    -- Override del docente
    SELECT resultado_override
    INTO   v_override
    FROM   academ.resultado_materia
    WHERE  inscripcion_id = p_inscripcion_id;

    v_final := CASE
        WHEN v_override IS NOT NULL THEN LEAST(v_override::NUMERIC(8,4), v_cal_max)
        ELSE v_calculado
    END;

    RETURN QUERY SELECT
        v_promedio_base, v_bonus_mat, v_calculado, v_final,
        v_total_unidades, v_unid_con_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- F06: Verificar si una unidad tiene actividades con resultados registrados
--      (para bloquear modificaciones de estructura)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_unidad_tiene_resultados(p_unidad_id INT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   academ.resultado_actividad ra
        JOIN   academ.actividad           a ON a.id = ra.actividad_id
        WHERE  a.unidad_id = p_unidad_id
    );
$$;

-- -----------------------------------------------------------------------------
-- F07: Obtener desglose completo auditadle de un alumno en un grupo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_desglose_alumno(p_inscripcion_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_resultado JSONB;
BEGIN
    SELECT jsonb_build_object(
        'inscripcion_id',          i.id,
        'alumno',                  al.nombre || ' ' || al.apellido_pat,
        'no_control',              al.no_control,
        'grupo',                   g.nombre,
        'materia',                 m.nombre,
        'periodo',                 p.codigo,
        'unidades', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'unidad_id',            u.id,
                    'numero',               u.numero,
                    'nombre',               u.nombre,
                    'estado',               u.estado,
                    'resultado_unidad',     ru.resultado_final,
                    'promedio_base',        ru.promedio_base,
                    'bonus_unidad',         ru.bonus_aplicado,
                    'justificacion',        bu.justificacion,
                    'desglose_actividades', ru.desglose
                )
                ORDER BY u.numero
            )
            FROM   academ.unidad u
            LEFT JOIN academ.resultado_unidad ru
                   ON ru.unidad_id = u.id AND ru.inscripcion_id = i.id
            LEFT JOIN academ.bonus_unidad bu
                   ON bu.unidad_id = u.id AND bu.inscripcion_id = i.id
            WHERE  u.grupo_id = g.id
        ),
        'resultado_materia',       rm.resultado_final,
        'promedio_base_materia',   rm.promedio_base,
        'bonus_materia',           rm.bonus_aplicado,
        'resultado_override',      rm.resultado_override,
        'justificacion_override',  rm.justificacion_override
    )
    INTO v_resultado
    FROM   academ.inscripcion       i
    JOIN   academ.alumno            al ON al.id = i.alumno_id
    JOIN   academ.grupo             g  ON g.id  = i.grupo_id
    JOIN   academ.plan_materia      pm ON pm.id = g.plan_materia_id
    JOIN   academ.materia           m  ON m.id  = pm.materia_id
    JOIN   academ.periodo_academico p  ON p.id  = g.periodo_id
    LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
    WHERE  i.id = p_inscripcion_id;

    RETURN v_resultado;
END;
$$;

-- =============================================================================
-- SECCIÓN J: TRIGGERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TG01: updated_at automático en tablas vigentes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_alumno_updated_at
    BEFORE UPDATE ON academ.alumno
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_updated_at();

CREATE TRIGGER tg_docente_updated_at
    BEFORE UPDATE ON academ.docente
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_updated_at();

CREATE TRIGGER tg_grupo_updated_at
    BEFORE UPDATE ON academ.grupo
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_updated_at();

CREATE TRIGGER tg_periodo_updated_at
    BEFORE UPDATE ON academ.periodo_academico
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_updated_at();

CREATE TRIGGER tg_materia_updated_at
    BEFORE UPDATE ON academ.materia
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_updated_at();

CREATE TRIGGER tg_actividad_updated_at
    BEFORE UPDATE ON academ.actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_updated_at();

CREATE TRIGGER tg_tipo_actividad_updated_at
    BEFORE UPDATE ON academ.tipo_actividad_catalogo
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_updated_at();

-- -----------------------------------------------------------------------------
-- TG02: Validar ponderación al insertar/actualizar una actividad
--       Regla: suma de ponderaciones de la unidad NO puede superar 100%
--              y la unidad debe estar en estado EDICION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_validar_ponderacion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_suma_actual   NUMERIC(8,3);
    v_estado_unidad VARCHAR(20);
BEGIN
    SELECT estado INTO v_estado_unidad
    FROM   academ.unidad
    WHERE  id = NEW.unidad_id;

    IF v_estado_unidad <> 'EDICION' THEN
        RAISE EXCEPTION
            'No se puede modificar actividades de una unidad en estado %. Solo se permiten cambios en estado EDICION.',
            v_estado_unidad
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(SUM(ponderacion), 0)
    INTO   v_suma_actual
    FROM   academ.actividad
    WHERE  unidad_id = NEW.unidad_id
      AND  activa    = TRUE
      AND  id <> COALESCE(NEW.id, 0);

    v_suma_actual := v_suma_actual + NEW.ponderacion;

    IF v_suma_actual > 100.001 THEN
        RAISE EXCEPTION
            'La suma de ponderaciones excede 100%%. Suma actual sería: %.3f%%',
            v_suma_actual
            USING ERRCODE = 'P0002';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_actividad_validar_ponderacion
    BEFORE INSERT OR UPDATE OF ponderacion, unidad_id, activa
    ON academ.actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_validar_ponderacion();

-- -----------------------------------------------------------------------------
-- TG03: Auditoría automática de cambios en actividad
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_audit_actividad()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM academ.fn_log_auditoria('actividad', NEW.id::TEXT, 'INSERT', NULL, to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM academ.fn_log_auditoria('actividad', NEW.id::TEXT, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM academ.fn_log_auditoria('actividad', OLD.id::TEXT, 'DELETE', to_jsonb(OLD), NULL);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tg_actividad_audit
    AFTER INSERT OR UPDATE OR DELETE ON academ.actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_audit_actividad();

-- -----------------------------------------------------------------------------
-- TG04: Validaciones al registrar o modificar un resultado_actividad
--       a) El alumno debe tener inscripción activa en el grupo de la actividad
--       b) La calificación debe estar en el rango [0, calificacion_maxima]
--       c) Si la unidad está FINALIZADA, bloquear
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_validar_resultado_actividad()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cal_max       NUMERIC(6,3);
    v_estado_unidad VARCHAR(20);
    v_inscrito      BOOLEAN;
BEGIN
    -- a) Verificar inscripción activa
    v_inscrito := academ.fn_alumno_inscrito_en_grupo_de_actividad(
        NEW.inscripcion_id, NEW.actividad_id
    );

    IF NOT v_inscrito THEN
        RAISE EXCEPTION
            'El alumno (inscripcion_id=%) no está inscrito activamente en el grupo de la actividad %.',
            NEW.inscripcion_id, NEW.actividad_id
            USING ERRCODE = 'P0003';
    END IF;

    -- b) Estado de la unidad
    SELECT u.estado
    INTO   v_estado_unidad
    FROM   academ.actividad a
    JOIN   academ.unidad    u ON u.id = a.unidad_id
    WHERE  a.id = NEW.actividad_id;

    IF v_estado_unidad = 'FINALIZADA' THEN
        RAISE EXCEPTION
            'No se pueden registrar resultados en una unidad FINALIZADA.'
            USING ERRCODE = 'P0004';
    END IF;

    -- c) Validar rango de calificación
    IF NEW.calificacion IS NOT NULL THEN
        SELECT g.calificacion_maxima
        INTO   v_cal_max
        FROM   academ.inscripcion i
        JOIN   academ.grupo       g ON g.id = i.grupo_id
        WHERE  i.id = NEW.inscripcion_id;

        IF NEW.calificacion > v_cal_max THEN
            RAISE EXCEPTION
                'La calificación % supera el máximo permitido (%) para este grupo.',
                NEW.calificacion, v_cal_max
                USING ERRCODE = 'P0005';
        END IF;
    END IF;

    -- d) Si estado_entrega = NP, forzar calificacion = 0
    IF NEW.estado_entrega = 'NP' THEN
        NEW.calificacion := 0;
    END IF;

    -- e) Registrar fecha de modificación en UPDATE
    IF TG_OP = 'UPDATE' THEN
        NEW.fecha_modificacion := NOW();
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_resultado_actividad_validar
    BEFORE INSERT OR UPDATE ON academ.resultado_actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_validar_resultado_actividad();

-- -----------------------------------------------------------------------------
-- TG05: Auditoría de resultado_actividad (cambios de calificación)
-- Usa app.usuario_id (UUID) en lugar de app.usuario (texto) para consistencia
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_audit_resultado_actividad()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_op       TEXT;
    v_uid      UUID;
BEGIN
    v_op := CASE TG_OP WHEN 'INSERT' THEN 'INSERT' ELSE 'UPDATE' END;

    -- Leer UUID del usuario desde la configuración de sesión
    BEGIN
        v_uid := NULLIF(current_setting('app.usuario_id', TRUE), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_uid := NULL;
    END;

    PERFORM academ.fn_log_auditoria(
        'resultado_actividad',
        NEW.id::TEXT,
        v_op,
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW),
        v_uid,
        current_setting('app.motivo', TRUE)
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_resultado_actividad_audit
    AFTER INSERT OR UPDATE ON academ.resultado_actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_audit_resultado_actividad();

-- -----------------------------------------------------------------------------
-- TG06: Al modificar un resultado_actividad, recalcular automáticamente
--       el resultado_unidad si ya está persistido (unidad CERRADA)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_recalcular_resultado_unidad()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_unidad_id     INT;
    v_estado_unidad VARCHAR(20);
    v_calc          RECORD;
    v_existe        BOOLEAN;
BEGIN
    SELECT a.unidad_id, u.estado
    INTO   v_unidad_id, v_estado_unidad
    FROM   academ.actividad a
    JOIN   academ.unidad    u ON u.id = a.unidad_id
    WHERE  a.id = NEW.actividad_id;

    IF v_estado_unidad IN ('CERRADA', 'FINALIZADA') THEN
        SELECT EXISTS (
            SELECT 1 FROM academ.resultado_unidad
            WHERE inscripcion_id = NEW.inscripcion_id
              AND unidad_id      = v_unidad_id
        ) INTO v_existe;

        IF v_existe THEN
            SELECT * INTO v_calc
            FROM academ.fn_calcular_resultado_unidad(NEW.inscripcion_id, v_unidad_id);

            UPDATE academ.resultado_unidad
            SET promedio_base   = v_calc.promedio_base,
                bonus_aplicado  = v_calc.bonus_aplicado,
                resultado_final = v_calc.resultado_final,
                desglose        = v_calc.desglose,
                fecha_calculo   = NOW(),
                version         = version + 1
            WHERE inscripcion_id = NEW.inscripcion_id
              AND unidad_id      = v_unidad_id;

            PERFORM academ.fn_recalcular_resultado_materia(NEW.inscripcion_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_resultado_actividad_recalcular
    AFTER INSERT OR UPDATE ON academ.resultado_actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_recalcular_resultado_unidad();

-- -----------------------------------------------------------------------------
-- TG07: Al modificar un bonus_unidad, recalcular resultado_unidad en cascada
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_recalcular_por_bonus_unidad()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_calc   RECORD;
    v_existe BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM academ.resultado_unidad
        WHERE inscripcion_id = NEW.inscripcion_id
          AND unidad_id      = NEW.unidad_id
    ) INTO v_existe;

    IF v_existe THEN
        SELECT * INTO v_calc
        FROM academ.fn_calcular_resultado_unidad(NEW.inscripcion_id, NEW.unidad_id);

        UPDATE academ.resultado_unidad
        SET promedio_base   = v_calc.promedio_base,
            bonus_aplicado  = v_calc.bonus_aplicado,
            resultado_final = v_calc.resultado_final,
            desglose        = v_calc.desglose,
            fecha_calculo   = NOW(),
            version         = version + 1
        WHERE inscripcion_id = NEW.inscripcion_id
          AND unidad_id      = NEW.unidad_id;
    END IF;

    PERFORM academ.fn_recalcular_resultado_materia(NEW.inscripcion_id);

    PERFORM academ.fn_log_auditoria(
        'bonus_unidad', NEW.id::TEXT, 'BONUS_APLICADO',
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW),
        (SELECT NULLIF(current_setting('app.usuario_id', TRUE), '')::UUID),
        NEW.justificacion
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_bonus_unidad_recalcular
    AFTER INSERT OR UPDATE ON academ.bonus_unidad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_recalcular_por_bonus_unidad();

-- -----------------------------------------------------------------------------
-- TG08: Al modificar bonus_materia, recalcular resultado_materia
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_recalcular_por_bonus_materia()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM academ.fn_recalcular_resultado_materia(NEW.inscripcion_id);

    PERFORM academ.fn_log_auditoria(
        'bonus_materia', NEW.id::TEXT, 'BONUS_APLICADO',
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW),
        (SELECT NULLIF(current_setting('app.usuario_id', TRUE), '')::UUID),
        NEW.justificacion
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_bonus_materia_recalcular
    AFTER INSERT OR UPDATE ON academ.bonus_materia
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_recalcular_por_bonus_materia();

-- -----------------------------------------------------------------------------
-- TG09: Prevenir DELETE físico en resultado_actividad
--       (forzar baja lógica a través del procedimiento)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_bloquear_delete_resultado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'No se permite eliminar resultados directamente. Use el procedimiento sp_anular_resultado_actividad.'
        USING ERRCODE = 'P0006';
END;
$$;

CREATE TRIGGER tg_resultado_actividad_no_delete
    BEFORE DELETE ON academ.resultado_actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_bloquear_delete_resultado();

-- -----------------------------------------------------------------------------
-- TG10: Bloquear inserción de calificaciones si la suma de ponderaciones
--       de la unidad a la que pertenece la actividad NO es exactamente 100%
--       Esto garantiza que no se puedan registrar notas en unidades incompletas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION academ.fn_tg_validar_ponderacion_completa()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_unidad_id INT;
    v_suma      NUMERIC(8,3);
BEGIN
    -- Obtener la unidad de la actividad
    SELECT unidad_id INTO v_unidad_id
    FROM academ.actividad
    WHERE id = NEW.actividad_id;

    -- Sumar las ponderaciones activas de esa unidad
    v_suma := academ.fn_suma_ponderaciones(v_unidad_id);

    IF ABS(v_suma - 100) > 0.01 THEN
        RAISE EXCEPTION
            'No se puede registrar calificaciones: la suma de ponderaciones de la unidad es %.2f%%. Debe ser exactamente 100%% antes de capturar calificaciones.',
            v_suma
            USING ERRCODE = 'P0007';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_resultado_actividad_ponderacion_completa
    BEFORE INSERT OR UPDATE ON academ.resultado_actividad
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_validar_ponderacion_completa();

-- =============================================================================
-- SECCIÓN K: FUNCIÓN DE RECÁLCULO EN CASCADA (usada por triggers)
-- Separada de los triggers para evitar dependencias circulares
-- =============================================================================

CREATE OR REPLACE FUNCTION academ.fn_recalcular_resultado_materia(p_inscripcion_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_calc   RECORD;
    v_existe BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM academ.resultado_materia
        WHERE inscripcion_id = p_inscripcion_id
    ) INTO v_existe;

    IF NOT v_existe THEN
        RETURN;  -- El snapshot de materia aún no existe, se creará al finalizar
    END IF;

    SELECT * INTO v_calc
    FROM academ.fn_calcular_resultado_materia(p_inscripcion_id);

    UPDATE academ.resultado_materia
    SET promedio_base       = v_calc.promedio_base,
        bonus_aplicado      = v_calc.bonus_aplicado,
        resultado_calculado = v_calc.resultado_calculado,
        resultado_final     = v_calc.resultado_final,
        fecha_calculo       = NOW(),
        version             = version + 1
    WHERE inscripcion_id = p_inscripcion_id;

    PERFORM academ.fn_log_auditoria(
        'resultado_materia', p_inscripcion_id::TEXT, 'RECALCULO',
        NULL, NULL,
        NULL, 'Recálculo en cascada automático'
    );
END;
$$;

-- =============================================================================
-- SECCIÓN L: PROCEDIMIENTOS ALMACENADOS (OPERACIONES PRINCIPALES)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SP00: Activar un periodo y cerrar de forma atómica el anterior
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- SP01: Cerrar una unidad
--       1. Verifica que la suma de ponderaciones = 100%
--       2. Verifica que todos los alumnos tienen resultado en todas las actividades
--          (inserta NP si p_forzar_nulos = TRUE)
--       3. Calcula y persiste resultado_unidad para cada alumno
--       4. Cambia estado de la unidad a CERRADA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE academ.sp_cerrar_unidad(
    p_unidad_id    INT,
    p_docente_id   UUID,
    p_forzar_nulos BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_suma_pond     NUMERIC(8,3);
    v_grupo_id      UUID;
    v_estado        VARCHAR(20);
    v_docente_grupo UUID;
    v_calc          RECORD;
    v_insc          RECORD;
    v_act           RECORD;
BEGIN
    SELECT u.estado, u.grupo_id, g.docente_id
    INTO   v_estado, v_grupo_id, v_docente_grupo
    FROM   academ.unidad u JOIN academ.grupo g ON g.id = u.grupo_id
    WHERE  u.id = p_unidad_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unidad % no encontrada.', p_unidad_id USING ERRCODE = 'P0010';
    END IF;

    IF v_estado <> 'EDICION' THEN
        RAISE EXCEPTION 'La unidad ya está en estado %. Solo se puede cerrar desde EDICION.', v_estado
            USING ERRCODE = 'P0011';
    END IF;

    -- Validar docente (Admin siempre pasa)
    IF v_docente_grupo IS DISTINCT FROM p_docente_id THEN
        -- Si no coinciden, verificamos si el actor es ADMIN
        IF NOT EXISTS (
            SELECT 1 FROM academ.usuario u 
            WHERE u.id = NULLIF(current_setting('app.usuario_id', TRUE), '')::UUID 
              AND 'ADMIN' = ANY(academ.fn_roles_usuario(u.id))
        ) THEN
            RAISE EXCEPTION 'El docente % no está autorizado para esta unidad.', p_docente_id
                USING ERRCODE = 'P0012';
        END IF;
    END IF;

    v_suma_pond := academ.fn_suma_ponderaciones(p_unidad_id);

    IF ABS(v_suma_pond - 100) > 0.01 THEN
        RAISE EXCEPTION 'La suma de ponderaciones es %.3f%%. Debe ser exactamente 100%% para cerrar la unidad.',
            v_suma_pond USING ERRCODE = 'P0013';
    END IF;

    IF p_forzar_nulos THEN
        FOR v_insc IN
            SELECT i.id AS inscripcion_id FROM academ.inscripcion i
            WHERE i.grupo_id = v_grupo_id AND i.estado = 'ACTIVA'
        LOOP
            FOR v_act IN
                SELECT id FROM academ.actividad
                WHERE unidad_id = p_unidad_id AND activa = TRUE
            LOOP
                INSERT INTO academ.resultado_actividad
                    (inscripcion_id, actividad_id, calificacion, estado_entrega, registrado_por)
                VALUES (v_insc.inscripcion_id, v_act.id, 0, 'NP', p_docente_id)
                ON CONFLICT (inscripcion_id, actividad_id) DO NOTHING;
            END LOOP;
        END LOOP;
    ELSE
        PERFORM 1
        FROM academ.inscripcion i
        CROSS JOIN academ.actividad a
        LEFT JOIN academ.resultado_actividad ra
               ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
        WHERE i.grupo_id  = v_grupo_id AND i.estado = 'ACTIVA'
          AND a.unidad_id = p_unidad_id AND a.activa = TRUE
          AND ra.id IS NULL;

        IF FOUND THEN
            RAISE EXCEPTION
                'Hay alumnos sin calificación en algunas actividades. Use p_forzar_nulos=TRUE para registrar como NP automáticamente.'
                USING ERRCODE = 'P0014';
        END IF;
    END IF;

    FOR v_insc IN
        SELECT i.id AS inscripcion_id FROM academ.inscripcion i
        WHERE i.grupo_id = v_grupo_id AND i.estado = 'ACTIVA'
    LOOP
        SELECT * INTO v_calc
        FROM academ.fn_calcular_resultado_unidad(v_insc.inscripcion_id, p_unidad_id);

        INSERT INTO academ.resultado_unidad
            (inscripcion_id, unidad_id, promedio_base, bonus_aplicado, resultado_final, desglose)
        VALUES
            (v_insc.inscripcion_id, p_unidad_id,
             v_calc.promedio_base, v_calc.bonus_aplicado,
             v_calc.resultado_final, v_calc.desglose)
        ON CONFLICT (inscripcion_id, unidad_id) DO UPDATE SET
            promedio_base   = EXCLUDED.promedio_base,
            bonus_aplicado  = EXCLUDED.bonus_aplicado,
            resultado_final = EXCLUDED.resultado_final,
            desglose        = EXCLUDED.desglose,
            fecha_calculo   = NOW(),
            version         = resultado_unidad.version + 1;
    END LOOP;

    UPDATE academ.unidad
    SET estado = 'CERRADA', fecha_cierre = NOW(), cerrado_por = p_docente_id
    WHERE id = p_unidad_id;

    PERFORM academ.fn_log_auditoria(
        'unidad', p_unidad_id::TEXT, 'UNIDAD_CERRADA',
        jsonb_build_object('estado', 'EDICION'),
        jsonb_build_object('estado', 'CERRADA', 'cerrado_por', p_docente_id),
        NULL, NULL
    );

    RAISE NOTICE 'Unidad % cerrada exitosamente. Resultados calculados para todos los alumnos.', p_unidad_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- SP02: Finalizar materia (grupo)
--       Calcula y persiste resultado_materia para cada alumno
--       Cambia estado de grupo y todas sus unidades a FINALIZADO/FINALIZADA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE academ.sp_finalizar_materia(
    p_grupo_id   UUID,
    p_docente_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_docente_grupo     UUID;
    v_estado_grupo      VARCHAR(20);
    v_unidades_abiertas INT;
    v_calc              RECORD;
    v_insc              RECORD;
BEGIN
    SELECT docente_id, estado INTO v_docente_grupo, v_estado_grupo
    FROM   academ.grupo WHERE id = p_grupo_id;

    IF v_estado_grupo <> 'ACTIVO' THEN
        RAISE EXCEPTION 'El grupo % ya está en estado %.', p_grupo_id, v_estado_grupo
            USING ERRCODE = 'P0020';
    END IF;

    IF v_docente_grupo <> p_docente_id THEN
        RAISE EXCEPTION 'El docente % no está autorizado para este grupo.', p_docente_id
            USING ERRCODE = 'P0021';
    END IF;

    SELECT COUNT(*) INTO v_unidades_abiertas
    FROM academ.unidad WHERE grupo_id = p_grupo_id AND estado = 'EDICION';

    IF v_unidades_abiertas > 0 THEN
        RAISE EXCEPTION
            'Hay % unidades en estado EDICION. Cierre todas las unidades antes de finalizar la materia.',
            v_unidades_abiertas USING ERRCODE = 'P0022';
    END IF;

    FOR v_insc IN
        SELECT id AS inscripcion_id FROM academ.inscripcion
        WHERE grupo_id = p_grupo_id AND estado = 'ACTIVA'
    LOOP
        SELECT * INTO v_calc FROM academ.fn_calcular_resultado_materia(v_insc.inscripcion_id);

        INSERT INTO academ.resultado_materia
            (inscripcion_id, promedio_base, bonus_aplicado, resultado_calculado, resultado_final)
        VALUES
            (v_insc.inscripcion_id, v_calc.promedio_base, v_calc.bonus_aplicado,
             v_calc.resultado_calculado, v_calc.resultado_final)
        ON CONFLICT (inscripcion_id) DO UPDATE SET
            promedio_base       = EXCLUDED.promedio_base,
            bonus_aplicado      = EXCLUDED.bonus_aplicado,
            resultado_calculado = EXCLUDED.resultado_calculado,
            resultado_final     = EXCLUDED.resultado_final,
            fecha_calculo       = NOW(),
            version             = resultado_materia.version + 1;
    END LOOP;

    UPDATE academ.unidad SET estado = 'FINALIZADA' WHERE grupo_id = p_grupo_id;
    UPDATE academ.grupo  SET estado = 'FINALIZADO', updated_at = NOW() WHERE id = p_grupo_id;

    PERFORM academ.fn_log_auditoria(
        'grupo', p_grupo_id::TEXT, 'MATERIA_FINALIZADA',
        jsonb_build_object('estado', 'ACTIVO'),
        jsonb_build_object('estado', 'FINALIZADO', 'finalizado_por', p_docente_id),
        NULL, NULL
    );

    RAISE NOTICE 'Materia (grupo %) finalizada. Resultados calculados para todos los alumnos.', p_grupo_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- FIN DE SECCIÓN TABLAS Y TRIGGERS BÁSICOS
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- SP05: Registrar o actualizar calificación (con auditoría)
-- Usa app.usuario_id (UUID) para la auditoría
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- SP06: Importación masiva de alumnos desde CSV (tabla temporal)
--       La aplicación carga el CSV a una tabla temporal y llama este SP
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE academ.sp_importar_alumnos(
    OUT p_insertados INT,
    OUT p_omitidos   INT,
    OUT p_errores    JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_errores JSONB := '[]'::JSONB;
    v_fila    RECORD;
    v_ins     INT := 0;
    v_omit    INT := 0;
BEGIN
    -- La tabla temporal 'tmp_importacion_alumnos' debe existir con columnas:
    -- fila_num, no_control, nombre, apellido_pat, apellido_mat, email
    FOR v_fila IN SELECT * FROM tmp_importacion_alumnos ORDER BY fila_num
    LOOP
        BEGIN
            INSERT INTO academ.alumno (no_control, nombre, apellido_pat, apellido_mat, email)
            VALUES (v_fila.no_control, v_fila.nombre, v_fila.apellido_pat,
                    v_fila.apellido_mat, NULLIF(v_fila.email,''))
            ON CONFLICT (no_control) DO NOTHING;

            IF FOUND THEN v_ins  := v_ins  + 1;
            ELSE          v_omit := v_omit + 1;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_errores := v_errores || jsonb_build_object(
                'fila',      v_fila.fila_num,
                'no_control', v_fila.no_control,
                'error',     SQLERRM
            );
        END;
    END LOOP;

    p_insertados := v_ins;
    p_omitidos   := v_omit;
    p_errores    := v_errores;
END;
$$;

-- =============================================================================
-- SECCIÓN M: VISTAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- V01: Vista de suma de ponderaciones por unidad (para validación en tiempo real)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW academ.v_suma_ponderaciones AS
SELECT
    u.id    AS unidad_id,
    u.nombre AS unidad_nombre,
    u.estado AS unidad_estado,
    g.id    AS grupo_id,
    g.nombre AS grupo_nombre,
    COUNT(a.id) AS num_actividades,
    COALESCE(SUM(a.ponderacion), 0) AS suma_ponderaciones,
    ROUND(100 - COALESCE(SUM(a.ponderacion), 0), 3) AS pendiente,
    CASE
        WHEN ABS(COALESCE(SUM(a.ponderacion), 0) - 100) < 0.01 THEN TRUE
        ELSE FALSE
    END AS estructura_completa
FROM academ.unidad u
JOIN academ.grupo  g ON g.id = u.grupo_id
LEFT JOIN academ.actividad a ON a.unidad_id = u.id AND a.activa = TRUE
GROUP BY u.id, u.nombre, u.estado, g.id, g.nombre;

COMMENT ON VIEW academ.v_suma_ponderaciones IS
    'Muestra el estado de la suma de ponderaciones por unidad para validación en tiempo real';

-- -----------------------------------------------------------------------------
-- V02: Vista de resultados parciales por alumno por unidad (modo dinámico)
--      Útil mientras la unidad está en edición
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW academ.v_resultados_parciales AS
SELECT
    i.id    AS inscripcion_id,
    al.no_control,
    al.nombre || ' ' || al.apellido_pat AS alumno,
    g.id    AS grupo_id,
    g.nombre AS grupo,
    m.nombre AS materia,
    u.id    AS unidad_id,
    u.numero AS unidad_numero,
    u.nombre AS unidad_nombre,
    u.estado AS unidad_estado,
    COUNT(a.id)  AS total_actividades,
    COUNT(ra.id) AS actividades_con_resultado,
    ROUND(
        COALESCE(SUM(COALESCE(ra.calificacion,0) * (a.ponderacion/100.0)), 0)
    , 4) AS promedio_parcial,
    COALESCE(bu.monto, 0) AS bonus_unidad,
    bu.justificacion,
    ROUND(
        LEAST(
            COALESCE(SUM(COALESCE(ra.calificacion,0) * (a.ponderacion/100.0)),0)
            + COALESCE(bu.monto, 0),
            g.calificacion_maxima
        ), 4
    ) AS resultado_estimado,
    ru.resultado_final AS resultado_persistido
FROM academ.inscripcion i
JOIN academ.alumno  al ON al.id = i.alumno_id
JOIN academ.grupo   g  ON g.id  = i.grupo_id
JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
JOIN academ.materia m  ON m.id  = pm.materia_id
JOIN academ.unidad  u  ON u.grupo_id = g.id
LEFT JOIN academ.actividad             a  ON a.unidad_id = u.id AND a.activa = TRUE
LEFT JOIN academ.resultado_actividad   ra ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
LEFT JOIN academ.bonus_unidad          bu ON bu.inscripcion_id = i.id AND bu.unidad_id = u.id
LEFT JOIN academ.resultado_unidad      ru ON ru.inscripcion_id = i.id AND ru.unidad_id = u.id
WHERE i.estado = 'ACTIVA'
GROUP BY i.id, al.no_control, al.nombre, al.apellido_pat, g.id, g.nombre,
         m.nombre, u.id, u.numero, u.nombre, u.estado,
         bu.monto, bu.justificacion, g.calificacion_maxima, ru.resultado_final;

-- -----------------------------------------------------------------------------
-- V03: Vista de resultado final de materia por grupo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW academ.v_resultados_finales AS
SELECT
    g.id    AS grupo_id,
    g.nombre AS grupo,
    m.nombre AS materia,
    m.clave  AS clave_materia,
    p.codigo AS periodo,
    d.nombre || ' ' || d.apellido_pat AS docente,
    al.no_control,
    al.nombre || ' ' || al.apellido_pat AS alumno,
    i.id     AS inscripcion_id,
    ROUND(rm.promedio_base, 2)       AS promedio_base,
    rm.bonus_aplicado                AS bonus_materia,
    bm.justificacion,
    ROUND(rm.resultado_calculado, 2) AS resultado_calculado,
    rm.resultado_override,
    ROUND(rm.resultado_final, 2)     AS resultado_final,
    CASE
        WHEN rm.resultado_final >= 70 THEN 'APROBADO'
        WHEN rm.resultado_final <  70 THEN 'REPROBADO'
        ELSE 'PENDIENTE'
    END AS estatus,
    rm.justificacion_override,
    rm.fecha_calculo
FROM academ.grupo              g
JOIN academ.plan_materia       pm ON pm.id = g.plan_materia_id
JOIN academ.materia            m  ON m.id  = pm.materia_id
JOIN academ.periodo_academico  p  ON p.id  = g.periodo_id
JOIN academ.docente            d  ON d.id  = g.docente_id
JOIN academ.inscripcion        i  ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
JOIN academ.alumno             al ON al.id = i.alumno_id
LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
LEFT JOIN academ.bonus_materia     bm ON bm.inscripcion_id = i.id
ORDER BY g.nombre, al.apellido_pat, al.nombre;

COMMENT ON VIEW academ.v_resultados_finales IS
    'Resultados finales por grupo, incluyendo estatus de aprobación';

-- -----------------------------------------------------------------------------
-- V04: Vista de actividades con estado de captura por alumno
--      Muestra qué le falta capturar al docente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW academ.v_captura_pendiente AS
SELECT
    g.id    AS grupo_id,
    g.nombre AS grupo,
    u.id    AS unidad_id,
    u.numero AS num_unidad,
    a.id    AS actividad_id,
    c.nombre  AS tipo_nombre,
    a.ponderacion,
    al.no_control,
    al.nombre || ' ' || al.apellido_pat AS alumno,
    i.id    AS inscripcion_id,
    ra.calificacion,
    ra.estado_entrega,
    CASE WHEN ra.id IS NULL THEN TRUE ELSE FALSE END AS pendiente
FROM academ.grupo       g
JOIN academ.unidad      u  ON u.grupo_id = g.id  AND u.estado = 'EDICION'
JOIN academ.actividad   a  ON a.unidad_id = u.id AND a.activa = TRUE
LEFT JOIN academ.tipo_actividad_catalogo c ON a.tipo_catalogo_id = c.id
JOIN academ.inscripcion i  ON i.grupo_id  = g.id AND i.estado = 'ACTIVA'
JOIN academ.alumno      al ON al.id = i.alumno_id
LEFT JOIN academ.resultado_actividad ra
       ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
ORDER BY g.nombre, u.numero, a.ponderacion DESC, al.apellido_pat;

-- -----------------------------------------------------------------------------
-- V05: Vista del historial de auditoría legible
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW academ.v_auditoria AS
SELECT
    al.id,
    al.ts,
    al.tabla,
    al.registro_id,
    al.operacion,
    al.usuario_app,
    al.motivo,
    al.valor_anterior,
    al.valor_nuevo
FROM academ.auditoria_log al
ORDER BY al.ts DESC;


-- -----------------------------------------------------------------------------
-- V06: Vista de los grupos del alumno
-- -----------------------------------------------------------------------------
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
    g.periodo_id,
    d.nombre || ' ' || d.apellido_pat AS docente,
    (SELECT resultado_final FROM academ.fn_calcular_resultado_materia(i.id)) AS resultado_final
FROM academ.inscripcion i
JOIN academ.grupo g ON g.id = i.grupo_id
JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
JOIN academ.materia m ON m.id = pm.materia_id
JOIN academ.docente d ON d.id = g.docente_id;


-- =============================================================================
-- SECCIÓN N2: VISTAS ANALÍTICAS (BI / KPIs)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- V_ANALITICA_DOCENTE
-- Rendimiento comparativo del grupo del docente vs. el promedio de la materia
-- en todos los grupos del mismo periodo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW academ.v_analitica_docente AS
WITH promedios_grupo AS (
    SELECT
        g.id                                            AS grupo_id,
        g.nombre                                        AS grupo,
        g.docente_id,
        d.nombre || ' ' || d.apellido_pat               AS docente,
        m.id                                            AS materia_id,
        m.nombre                                        AS materia,
        p.codigo                                        AS periodo,
        g.estado                                        AS estado_grupo,
        COUNT(i.id)                                     AS total_alumnos,
        ROUND(AVG(rm.resultado_final)::NUMERIC, 2)      AS promedio_grupo,
        COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70) AS aprobados,
        COUNT(rm.id) FILTER (WHERE rm.resultado_final <  70) AS reprobados,
        ROUND(STDDEV(rm.resultado_final)::NUMERIC, 2)   AS desviacion_estandar
    FROM academ.grupo              g
    JOIN academ.docente            d  ON d.id = g.docente_id
    JOIN academ.plan_materia       pm ON pm.id = g.plan_materia_id
    JOIN academ.materia            m  ON m.id = pm.materia_id
    JOIN academ.periodo_academico  p  ON p.id = g.periodo_id
    JOIN academ.inscripcion        i  ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
    LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
    GROUP BY g.id, g.nombre, g.docente_id, d.nombre, d.apellido_pat,
             m.id, m.nombre, p.codigo, g.estado
),
promedio_materia_periodo AS (
    SELECT
        m.id    AS materia_id,
        p.codigo AS periodo,
        ROUND(AVG(rm.resultado_final)::NUMERIC, 2) AS promedio_materia
    FROM academ.resultado_materia rm
    JOIN academ.inscripcion       i  ON i.id  = rm.inscripcion_id
    JOIN academ.grupo             g  ON g.id  = i.grupo_id
    JOIN academ.plan_materia      pm ON pm.id = g.plan_materia_id
    JOIN academ.materia           m  ON m.id  = pm.materia_id
    JOIN academ.periodo_academico p  ON p.id  = g.periodo_id
    GROUP BY m.id, p.codigo
)
SELECT
    pg.*,
    pmp.promedio_materia,
    ROUND((pg.promedio_grupo - pmp.promedio_materia)::NUMERIC, 2) AS diferencia_vs_materia,
    CASE
        WHEN pg.promedio_grupo > pmp.promedio_materia THEN 'SOBRE_PROMEDIO'
        WHEN pg.promedio_grupo < pmp.promedio_materia THEN 'BAJO_PROMEDIO'
        ELSE 'EN_PROMEDIO'
    END AS rendimiento_relativo,
    ROUND(100.0 * pg.aprobados / NULLIF(pg.total_alumnos, 0), 1) AS eficiencia_terminal_pct
FROM promedios_grupo pg
LEFT JOIN promedio_materia_periodo pmp
       ON pmp.materia_id = pg.materia_id AND pmp.periodo = pg.periodo;

COMMENT ON VIEW academ.v_analitica_docente IS
    'KPI por grupo: promedio del grupo vs promedio de la materia en el periodo. Rendimiento relativo del docente.';

-- -----------------------------------------------------------------------------
-- V_ANALITICA_ADMIN
-- Vista institucional: tasa de reprobación, eficiencia terminal y ranking
-- por materia y por docente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW academ.v_analitica_admin AS
SELECT
    m.id                                                          AS materia_id,
    m.nombre                                                      AS materia,
    m.clave                                                       AS clave_materia,
    p.codigo                                                      AS periodo,
    COUNT(DISTINCT g.id)                                          AS num_grupos,
    d.nombre || ' ' || d.apellido_pat                            AS docente,
    g.id                                                          AS grupo_id,
    g.nombre                                                      AS grupo,
    COUNT(i.id)                                                   AS total_inscritos,
    COUNT(rm.id)                                                  AS total_con_resultado,
    ROUND(AVG(rm.resultado_final)::NUMERIC, 2)                    AS promedio_grupo,
    ROUND(MAX(rm.resultado_final)::NUMERIC, 2)                    AS calificacion_maxima,
    ROUND(MIN(rm.resultado_final)::NUMERIC, 2)                    AS calificacion_minima,
    COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70)          AS aprobados,
    COUNT(rm.id) FILTER (WHERE rm.resultado_final < 70)           AS reprobados,
    ROUND(
        100.0 * COUNT(rm.id) FILTER (WHERE rm.resultado_final < 70)
        / NULLIF(COUNT(rm.id), 0)
    , 1)                                                          AS tasa_reprobacion_pct,
    ROUND(
        100.0 * COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70)
        / NULLIF(COUNT(i.id), 0)
    , 1)                                                          AS eficiencia_terminal_pct
FROM academ.grupo              g
JOIN academ.plan_materia       pm ON pm.id = g.plan_materia_id
JOIN academ.materia            m  ON m.id = pm.materia_id
JOIN academ.docente            d  ON d.id = g.docente_id
JOIN academ.periodo_academico  p  ON p.id = g.periodo_id
JOIN academ.inscripcion        i  ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
GROUP BY m.id, m.nombre, m.clave, p.codigo, d.nombre, d.apellido_pat, g.id, g.nombre
ORDER BY tasa_reprobacion_pct DESC NULLS LAST, promedio_grupo ASC NULLS LAST;

COMMENT ON VIEW academ.v_analitica_admin IS
    'Panel administrativo: tasa de reprobación, eficiencia terminal y ranking por materia/docente/grupo.';

-- -----------------------------------------------------------------------------
-- V_ANALITICA_ALUMNO
-- Posicionamiento del alumno dentro de su grupo y percentil.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW academ.v_analitica_alumno AS
WITH resultados_grupo AS (
    SELECT
        i.alumno_id,
        i.grupo_id,
        i.id                                                  AS inscripcion_id,
        rm.resultado_final,
        AVG(rm.resultado_final) OVER (PARTITION BY i.grupo_id) AS promedio_grupo,
        STDDEV(rm.resultado_final) OVER (PARTITION BY i.grupo_id) AS desviacion_grupo,
        COUNT(*)           OVER (PARTITION BY i.grupo_id)     AS total_alumnos,
        RANK()             OVER (PARTITION BY i.grupo_id ORDER BY rm.resultado_final DESC) AS posicion_grupo,
        PERCENT_RANK()     OVER (PARTITION BY i.grupo_id ORDER BY rm.resultado_final)      AS percentil_ascendente
    FROM academ.inscripcion i
    JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
    WHERE i.estado = 'ACTIVA'
)
SELECT
    al.no_control,
    al.nombre || ' ' || al.apellido_pat                              AS alumno,
    m.nombre                                                          AS materia,
    g.nombre                                                          AS grupo,
    p.codigo                                                          AS periodo,
    rg.inscripcion_id,
    ROUND(rg.resultado_final::NUMERIC, 2)                             AS resultado_final,
    ROUND(rg.promedio_grupo::NUMERIC, 2)                              AS promedio_grupo,
    ROUND((rg.resultado_final - rg.promedio_grupo)::NUMERIC, 2)       AS diferencia_vs_media,
    CASE
        WHEN rg.resultado_final > rg.promedio_grupo THEN 'SOBRE_MEDIA'
        WHEN rg.resultado_final < rg.promedio_grupo THEN 'BAJO_MEDIA'
        ELSE 'EN_MEDIA'
    END                                                               AS posicion_relativa,
    rg.posicion_grupo,
    rg.total_alumnos,
    ROUND((1 - rg.percentil_ascendente) * 100)::INT                  AS percentil_superior,
    CASE WHEN rg.resultado_final >= 70 THEN 'APROBADO' ELSE 'REPROBADO' END AS estatus
FROM resultados_grupo rg
JOIN academ.alumno            al ON al.id = rg.alumno_id
JOIN academ.inscripcion       i  ON i.id  = rg.inscripcion_id
JOIN academ.grupo             g  ON g.id  = rg.grupo_id
JOIN academ.plan_materia      pm ON pm.id = g.plan_materia_id
JOIN academ.materia           m  ON m.id  = pm.materia_id
JOIN academ.periodo_academico p  ON p.id  = g.periodo_id;

COMMENT ON VIEW academ.v_analitica_alumno IS
    'Posición del alumno en su grupo: percentil, distancia a la media, ranking y estatus.';

-- -----------------------------------------------------------------------------
-- V_ACTIVIDADES_ALUMNO
-- Vista de actividades visibles para alumnos: tipo, ponderación, fechas,
-- calificación obtenida y estado de entrega, por inscripción/grupo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW academ.v_actividades_alumno AS
SELECT
    i.alumno_id,
    i.id                                                AS inscripcion_id,
    g.id                                                AS grupo_id,
    g.nombre                                            AS grupo,
    m.nombre                                            AS materia,
    u.id                                                AS unidad_id,
    u.numero                                            AS unidad_numero,
    u.nombre                                            AS unidad_nombre,
    u.estado                                            AS unidad_estado,
    a.id                                                AS actividad_id,
    c.nombre                                            AS tipo_nombre,
    a.descripcion,
    a.ponderacion,
    a.fecha_apertura,
    a.fecha_cierre,
    CASE
        WHEN a.fecha_apertura IS NULL OR NOW() >= a.fecha_apertura THEN TRUE
        ELSE FALSE
    END                                                 AS visible,
    CASE
        WHEN a.fecha_cierre IS NULL THEN 'ABIERTA'
        WHEN NOW() > a.fecha_cierre   THEN 'CERRADA'
        ELSE 'EN_PLAZO'
    END                                                 AS estatus_plazo,
    ra.calificacion,
    ra.estado_entrega,
    ra.fecha_registro,
    ra.fecha_modificacion
FROM academ.inscripcion            i
JOIN academ.grupo                  g  ON g.id = i.grupo_id
JOIN academ.plan_materia           pm ON pm.id = g.plan_materia_id
JOIN academ.materia                m  ON pm.materia_id = m.id
JOIN academ.unidad                 u  ON u.grupo_id = g.id
JOIN academ.actividad              a  ON a.unidad_id = u.id AND a.activa = TRUE
LEFT JOIN academ.tipo_actividad_catalogo c ON a.tipo_catalogo_id = c.id
LEFT JOIN academ.resultado_actividad ra
       ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
WHERE i.estado = 'ACTIVA'
  AND a.publicada = TRUE
ORDER BY u.numero, a.ponderacion DESC;

COMMENT ON VIEW academ.v_actividades_alumno IS
    'Actividades visibles para cada alumno: tipo, ponderación, fechas apertura/cierre, calificación y estado de entrega.';

-- =============================================================================
-- SECCIÓN O: PILAR 1 — BORRADOR DE FINALIZADO Y SELLO DEFINITIVO (PRECIERRE)
-- =============================================================================
-- Flujo: ACTIVO -> PRECIERRE -> FINALIZADO
-- PRECIERRE permite arbitraje (bonus materia, overrides).
-- FINALIZADO bloquea TODO de raíz.
-- =============================================================================

COMMENT ON COLUMN grupo.estado IS
    'ACTIVO: captura normal. PRECIERRE: borrador de auditoría, permite arbitraje (bonus/overrides). FINALIZADO: sellado permanente, bloquea todo.';

-- -----------------------------------------------------------------------------
-- SP-NEW-01: Precerrar materia (borrador)
--   Requisitos:
--     • El grupo debe estar en ACTIVO
--     • Todas las unidades deben estar CERRADAS (no EDICION)
--     • Genera snapshot tentativo en resultado_materia
--     • Cambia el estado del grupo a PRECIERRE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE academ.sp_pre_cerrar_materia(
    p_grupo_id   UUID,
    p_docente_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_docente_grupo     UUID;
    v_estado_grupo      VARCHAR(20);
    v_unidades_abiertas INT;
    v_calc              RECORD;
    v_insc              RECORD;
BEGIN
    SELECT docente_id, estado INTO v_docente_grupo, v_estado_grupo
    FROM   academ.grupo WHERE id = p_grupo_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grupo % no encontrado.', p_grupo_id USING ERRCODE = 'P0050';
    END IF;

    IF v_estado_grupo <> 'ACTIVO' THEN
        RAISE EXCEPTION 'El grupo ya está en estado %. Solo se puede precerrar desde ACTIVO.', v_estado_grupo
            USING ERRCODE = 'P0051';
    END IF;

    IF v_docente_grupo <> p_docente_id THEN
        RAISE EXCEPTION 'El docente % no está autorizado para este grupo.', p_docente_id
            USING ERRCODE = 'P0052';
    END IF;

    -- Verificar que NO haya unidades en EDICION
    SELECT COUNT(*) INTO v_unidades_abiertas
    FROM   academ.unidad WHERE grupo_id = p_grupo_id AND estado = 'EDICION';

    IF v_unidades_abiertas > 0 THEN
        RAISE EXCEPTION
            'Hay % unidades en estado EDICION. Cierre todas las unidades antes de precerrar la materia.',
            v_unidades_abiertas USING ERRCODE = 'P0053';
    END IF;

    -- Generar snapshot tentativo de resultado_materia para cada alumno inscrito
    FOR v_insc IN
        SELECT id AS inscripcion_id FROM academ.inscripcion
        WHERE grupo_id = p_grupo_id AND estado = 'ACTIVA'
    LOOP
        SELECT * INTO v_calc FROM academ.fn_calcular_resultado_materia(v_insc.inscripcion_id);

        INSERT INTO academ.resultado_materia
            (inscripcion_id, promedio_base, bonus_aplicado, resultado_calculado, resultado_final)
        VALUES
            (v_insc.inscripcion_id, v_calc.promedio_base, v_calc.bonus_aplicado,
             v_calc.resultado_calculado, v_calc.resultado_final)
        ON CONFLICT (inscripcion_id) DO UPDATE SET
            promedio_base       = EXCLUDED.promedio_base,
            bonus_aplicado      = EXCLUDED.bonus_aplicado,
            resultado_calculado = EXCLUDED.resultado_calculado,
            resultado_final     = EXCLUDED.resultado_final,
            fecha_calculo       = NOW(),
            version             = resultado_materia.version + 1;
    END LOOP;

    -- Cambiar estado a PRECIERRE
    UPDATE academ.grupo SET estado = 'PRECIERRE', updated_at = NOW() WHERE id = p_grupo_id;

    PERFORM academ.fn_log_auditoria(
        'grupo', p_grupo_id::TEXT, 'MATERIA_PRECIERRE',
        jsonb_build_object('estado', 'ACTIVO'),
        jsonb_build_object('estado', 'PRECIERRE', 'pre_cerrado_por', p_docente_id),
        NULL, NULL
    );

    RAISE NOTICE 'Grupo % en estado PRECIERRE. Ahora puede aplicar bonus de materia y overrides antes de sellar.', p_grupo_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- SP02-MOD: Sobreescritura de sp_finalizar_materia
--   MODIFICACIÓN: Ahora REQUIERE que el grupo esté en PRECIERRE (no ACTIVO)
--   para poder finalizar. Esto implementa el "Sello Definitivo".
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE academ.sp_finalizar_materia(
    p_grupo_id   UUID,
    p_docente_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_docente_grupo     UUID;
    v_estado_grupo      VARCHAR(20);
    v_unidades_abiertas INT;
    v_calc              RECORD;
    v_insc              RECORD;
BEGIN
    SELECT docente_id, estado INTO v_docente_grupo, v_estado_grupo
    FROM   academ.grupo WHERE id = p_grupo_id;

    -- *** CAMBIO CLAVE: Solo se permite desde PRECIERRE ***
    IF v_estado_grupo <> 'PRECIERRE' THEN
        RAISE EXCEPTION 'El grupo debe estar en PRECIERRE para finalizar. Estado actual: %. Use sp_pre_cerrar_materia primero.', v_estado_grupo
            USING ERRCODE = 'P0020';
    END IF;

    IF v_docente_grupo <> p_docente_id THEN
        RAISE EXCEPTION 'El docente % no está autorizado para este grupo.', p_docente_id
            USING ERRCODE = 'P0021';
    END IF;

    -- Recalcular snapshots finales (por si hubo overrides/bonus durante PRECIERRE)
    FOR v_insc IN
        SELECT id AS inscripcion_id FROM academ.inscripcion
        WHERE grupo_id = p_grupo_id AND estado = 'ACTIVA'
    LOOP
        SELECT * INTO v_calc FROM academ.fn_calcular_resultado_materia(v_insc.inscripcion_id);

        INSERT INTO academ.resultado_materia
            (inscripcion_id, promedio_base, bonus_aplicado, resultado_calculado, resultado_final)
        VALUES
            (v_insc.inscripcion_id, v_calc.promedio_base, v_calc.bonus_aplicado,
             v_calc.resultado_calculado, v_calc.resultado_final)
        ON CONFLICT (inscripcion_id) DO UPDATE SET
            promedio_base       = EXCLUDED.promedio_base,
            bonus_aplicado      = EXCLUDED.bonus_aplicado,
            resultado_calculado = EXCLUDED.resultado_calculado,
            -- Respetar override si ya existe
            resultado_final     = CASE
                WHEN resultado_materia.resultado_override IS NOT NULL
                THEN resultado_materia.resultado_override::NUMERIC(8,4)
                ELSE EXCLUDED.resultado_final
            END,
            fecha_calculo       = NOW(),
            version             = resultado_materia.version + 1;
    END LOOP;

    UPDATE academ.unidad SET estado = 'FINALIZADA' WHERE grupo_id = p_grupo_id;
    UPDATE academ.grupo  SET estado = 'FINALIZADO', updated_at = NOW() WHERE id = p_grupo_id;

    PERFORM academ.fn_log_auditoria(
        'grupo', p_grupo_id::TEXT, 'MATERIA_FINALIZADA',
        jsonb_build_object('estado', 'PRECIERRE'),
        jsonb_build_object('estado', 'FINALIZADO', 'finalizado_por', p_docente_id),
        NULL, NULL
    );

    RAISE NOTICE 'Materia (grupo %) FINALIZADA y SELLADA. No se permiten más modificaciones.', p_grupo_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- SP04-MOD: Sobreescritura de sp_override_resultado_materia
--   MODIFICACIÓN: Ahora REQUIERE que el grupo esté en PRECIERRE.
--   Si está FINALIZADO, se rechaza de raíz.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE academ.sp_override_resultado_materia(
    p_inscripcion_id     UUID,
    p_resultado_override NUMERIC(6,3),
    p_justificacion      VARCHAR(500),
    p_docente_id         UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_docente_grupo  UUID;
    v_cal_max        NUMERIC(6,3);
    v_valor_final    NUMERIC(8,4);
    v_estado_grupo   VARCHAR(20);
BEGIN
    IF LENGTH(TRIM(COALESCE(p_justificacion, ''))) < 20 THEN
        RAISE EXCEPTION 'La justificación del override debe tener al menos 20 caracteres.' USING ERRCODE = 'P0040';
    END IF;

    SELECT g.docente_id, g.calificacion_maxima, g.estado
    INTO   v_docente_grupo, v_cal_max, v_estado_grupo
    FROM   academ.inscripcion i
    JOIN   academ.grupo       g ON g.id = i.grupo_id
    WHERE  i.id = p_inscripcion_id;

    -- *** BLOQUEO: Solo en PRECIERRE ***
    IF v_estado_grupo = 'FINALIZADO' THEN
        RAISE EXCEPTION 'BLOQUEADO: La materia está FINALIZADA (Sello Definitivo). No se permiten overrides.'
            USING ERRCODE = 'P0044';
    END IF;

    IF v_estado_grupo <> 'PRECIERRE' THEN
        RAISE EXCEPTION 'Los overrides solo se permiten cuando el grupo está en PRECIERRE. Estado actual: %.', v_estado_grupo
            USING ERRCODE = 'P0045';
    END IF;

    -- Validar docente (Admin siempre pasa)
    IF v_docente_grupo IS DISTINCT FROM p_docente_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM academ.usuario u 
            WHERE u.id = NULLIF(current_setting('app.usuario_id', TRUE), '')::UUID 
              AND 'ADMIN' = ANY(academ.fn_roles_usuario(u.id))
        ) THEN
            RAISE EXCEPTION 'Docente no autorizado para esta inscripción.' USING ERRCODE = 'P0041';
        END IF;
    END IF;

    IF p_resultado_override < 0 OR p_resultado_override > v_cal_max THEN
        RAISE EXCEPTION 'El valor de override % está fuera del rango [0, %].',
            p_resultado_override, v_cal_max USING ERRCODE = 'P0042';
    END IF;

    v_valor_final := p_resultado_override::NUMERIC(8,4);

    UPDATE academ.resultado_materia
    SET resultado_override     = p_resultado_override,
        justificacion_override = p_justificacion,
        resultado_final        = v_valor_final,
        override_por           = p_docente_id,
        fecha_override         = NOW(),
        version                = version + 1
    WHERE inscripcion_id = p_inscripcion_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe resultado de materia para la inscripcion %. Use sp_pre_cerrar_materia primero.',
            p_inscripcion_id USING ERRCODE = 'P0043';
    END IF;

    PERFORM academ.fn_log_auditoria(
        'resultado_materia', p_inscripcion_id::TEXT, 'OVERRIDE_APLICADO',
        NULL,
        jsonb_build_object('override', p_resultado_override, 'justificacion', p_justificacion),
        NULL, p_justificacion
    );
END;
$$;

-- =============================================================================
-- SECCIÓN P: PILAR 2 — BLOQUEO Y REGLAS DE BONUS DE UNIDAD
-- =============================================================================
-- Reglas:
--   • Bonus de unidad BLOQUEADO si la unidad está CERRADA o FINALIZADA
--   • Bonus de unidad SOLO si el 100% de actividades están calificadas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SP03-MOD: Sobreescritura de sp_aplicar_bonus_unidad
--   MODIFICACIÓN: Bloqueo tajante si unidad CERRADA + validación 100% captura
-- -----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE academ.sp_aplicar_bonus_unidad(
    p_inscripcion_id UUID,
    p_unidad_id      INT,
    p_monto          NUMERIC(7,4),
    p_justificacion  VARCHAR(500),
    p_docente_id     UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_grupo_id      UUID;
    v_docente_grupo UUID;
    v_estado_grupo  VARCHAR(20);
    v_estado_unidad VARCHAR(20);
    v_numero_unidad INT;
    v_faltan_calif  BOOLEAN;
    v_unid_previa_abierta BOOLEAN;
BEGIN
    -- 1. Obtener datos de contexto (Grupo, Docente, Estados)
    SELECT g.id, g.docente_id, g.estado, u.estado, u.numero
    INTO   v_grupo_id, v_docente_grupo, v_estado_grupo, v_estado_unidad, v_numero_unidad
    FROM   academ.inscripcion i
    JOIN   academ.grupo       g ON g.id = i.grupo_id
    JOIN   academ.unidad      u ON u.grupo_id = g.id AND u.id = p_unidad_id
    WHERE  i.id = p_inscripcion_id;

    -- 2. Validar que el docente pertenezca al grupo (Admin siempre pasa)
    IF v_docente_grupo IS DISTINCT FROM p_docente_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM academ.usuario u 
            WHERE u.id = NULLIF(current_setting('app.usuario_id', TRUE), '')::UUID 
              AND 'ADMIN' = ANY(academ.fn_roles_usuario(u.id))
        ) THEN
            RAISE EXCEPTION 'Docente no autorizado para este grupo.' USING ERRCODE = 'P0030';
        END IF;
    END IF;

    -- 3. RESTRICCIÓN: Solo se permite bonus mientas la unidad esté abierta (EDICION)
    IF v_estado_unidad <> 'EDICION' THEN
        RAISE EXCEPTION 'BLOQUEADO: El bonus de unidad solo se puede aplicar mientras la unidad esté abierta (EDICION). Una vez cerrada, no se permiten más bonus.'
            USING ERRCODE = 'P0031';
    END IF;

    -- 4. RESTRICCIÓN: Verificar flujo secuencial (unidades anteriores cerradas)
    SELECT EXISTS (
        SELECT 1 FROM academ.unidad 
        WHERE grupo_id = v_grupo_id 
          AND numero < v_numero_unidad 
          AND estado = 'EDICION'
    ) INTO v_unid_previa_abierta;

    IF v_unid_previa_abierta THEN
        RAISE EXCEPTION 'BLOQUEADO: No puedes aplicar bonus a esta unidad si existen unidades anteriores que aún no han sido cerradas.'
            USING ERRCODE = 'P0035';
    END IF;

    -- 5. RESTRICCIÓN: Grupo no finalizado (Sello Definitivo)
    IF v_estado_grupo = 'FINALIZADO' THEN
        RAISE EXCEPTION 'BLOQUEADO: La materia ya ha sido FINALIZADA y sellada. No se permiten cambios.'
            USING ERRCODE = 'P0034';
    END IF;

    -- 6. RESTRICCIÓN: Captura al 100% EXCLUSIVAMENTE PARA ESTE ALUMNO
    SELECT EXISTS (
        SELECT 1
        FROM   academ.actividad a
        LEFT JOIN academ.resultado_actividad ra
               ON ra.actividad_id = a.id AND ra.inscripcion_id = p_inscripcion_id
        WHERE  a.unidad_id = p_unidad_id
          AND  a.activa    = TRUE
          AND  ra.id IS NULL
    ) INTO v_faltan_calif;

    IF v_faltan_calif THEN
        RAISE EXCEPTION 'BLOQUEADO: El alumno aún tiene actividades sin calificación registrada en esta unidad.'
            USING ERRCODE = 'P0033';
    END IF;

    -- 7. Aplicar o actualizar el bonus
    INSERT INTO academ.bonus_unidad
        (inscripcion_id, unidad_id, monto, justificacion, aplicado_por)
    VALUES
        (p_inscripcion_id, p_unidad_id, p_monto, p_justificacion, p_docente_id)
    ON CONFLICT (inscripcion_id, unidad_id) DO UPDATE SET
        monto            = EXCLUDED.monto,
        justificacion    = EXCLUDED.justificacion,
        aplicado_por     = EXCLUDED.aplicado_por,
        fecha_aplicacion = NOW();

    -- Nota: Al insertar en bonus_unidad, el trigger de la BD se encargará de recalcular
    -- el resultado final parcial de la unidad para el alumno.
END;
$$;


-- =============================================================================
-- SECCIÓN Q: PILAR 3 — ELIMINACIÓN SEGURA DE UNIDADES
-- =============================================================================
-- Reglas:
--   • Solo se permite eliminar una unidad en estado EDICION
--   • La unidad NO debe tener actividades con resultados registrados
--   • Se eliminan en cascada: actividades, bonus_unidad, resultado_unidad
--   • Se registra en auditoría
-- =============================================================================

CREATE OR REPLACE PROCEDURE academ.sp_eliminar_unidad(
    p_unidad_id  INT,
    p_docente_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_grupo_id       UUID;
    v_docente_grupo  UUID;
    v_estado_unidad  VARCHAR(20);
    v_estado_grupo   VARCHAR(20);
    v_nombre_unidad  VARCHAR(200);
    v_numero_unidad  SMALLINT;
    v_tiene_resultados BOOLEAN;
    v_num_actividades  INT;
BEGIN
    -- Obtener contexto
    SELECT u.grupo_id, u.estado, u.nombre, u.numero, g.docente_id, g.estado
    INTO   v_grupo_id, v_estado_unidad, v_nombre_unidad, v_numero_unidad, v_docente_grupo, v_estado_grupo
    FROM   academ.unidad u
    JOIN   academ.grupo  g ON g.id = u.grupo_id
    WHERE  u.id = p_unidad_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unidad % no encontrada.', p_unidad_id USING ERRCODE = 'P0060';
    END IF;

    -- Solo el docente del grupo puede eliminar
    IF v_docente_grupo <> p_docente_id THEN
        RAISE EXCEPTION 'El docente % no está autorizado para esta unidad.', p_docente_id
            USING ERRCODE = 'P0061';
    END IF;

    -- Solo se puede eliminar en estado EDICION
    IF v_estado_unidad <> 'EDICION' THEN
        RAISE EXCEPTION 'Solo se pueden eliminar unidades en estado EDICION. Estado actual: %.',
            v_estado_unidad USING ERRCODE = 'P0062';
    END IF;

    -- Grupo no debe estar FINALIZADO
    IF v_estado_grupo = 'FINALIZADO' THEN
        RAISE EXCEPTION 'No se pueden eliminar unidades de un grupo FINALIZADO.'
            USING ERRCODE = 'P0063';
    END IF;

    -- Verificar que NO tenga resultados registrados
    v_tiene_resultados := academ.fn_unidad_tiene_resultados(p_unidad_id);

    IF v_tiene_resultados THEN
        RAISE EXCEPTION 'BLOQUEADO: La unidad "% (Unidad %)" tiene actividades con calificaciones registradas. Elimine o vacíe los resultados primero.',
            v_nombre_unidad, v_numero_unidad USING ERRCODE = 'P0064';
    END IF;

    -- Contar actividades para el log
    SELECT COUNT(*) INTO v_num_actividades FROM academ.actividad WHERE unidad_id = p_unidad_id;

    -- Eliminar en orden de dependencias (hijos primero)
    DELETE FROM academ.bonus_unidad     WHERE unidad_id = p_unidad_id;
    DELETE FROM academ.resultado_unidad WHERE unidad_id = p_unidad_id;
    DELETE FROM academ.actividad        WHERE unidad_id = p_unidad_id;
    DELETE FROM academ.unidad           WHERE id = p_unidad_id;

    -- Registrar en auditoría
    PERFORM academ.fn_log_auditoria(
        'unidad', p_unidad_id::TEXT, 'UNIDAD_ELIMINADA',
        jsonb_build_object(
            'nombre', v_nombre_unidad,
            'numero', v_numero_unidad,
            'grupo_id', v_grupo_id,
            'actividades_eliminadas', v_num_actividades
        ),
        NULL,
        NULL,
        'Eliminación segura de unidad vacía'
    );

    RAISE NOTICE 'Unidad "% (Unidad %)" eliminada exitosamente con % actividades.', v_nombre_unidad, v_numero_unidad, v_num_actividades;
END;
$$;

-- =============================================================================
-- SECCIÓN R: BLOQUEO DE BONUS MATERIA EN ESTADO FINALIZADO
-- =============================================================================
-- El trigger TG08 ya recalcula bonus_materia, pero necesitamos bloquear
-- la inserción/edición directa cuando el grupo esté FINALIZADO.
-- =============================================================================

CREATE OR REPLACE FUNCTION academ.fn_tg_bloquear_bonus_materia_finalizado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_estado_grupo VARCHAR(20);
BEGIN
    SELECT g.estado INTO v_estado_grupo
    FROM   academ.inscripcion i
    JOIN   academ.grupo       g ON g.id = i.grupo_id
    WHERE  i.id = NEW.inscripcion_id;

    IF v_estado_grupo = 'FINALIZADO' THEN
        RAISE EXCEPTION 'BLOQUEADO: La materia está FINALIZADA (Sello Definitivo). No se permiten bonus de materia.'
            USING ERRCODE = 'P0070';
    END IF;

    -- Bonus de materia solo permitido en PRECIERRE
    IF v_estado_grupo <> 'PRECIERRE' THEN
        RAISE EXCEPTION 'Los bonus de materia solo se permiten cuando el grupo está en PRECIERRE. Estado actual: %.',
            v_estado_grupo USING ERRCODE = 'P0071';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER tg_bonus_materia_bloquear_finalizado
    BEFORE INSERT OR UPDATE ON academ.bonus_materia
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_bloquear_bonus_materia_finalizado();

-- =============================================================================
-- SECCIÓN N: DATOS DE CONFIGURACIÓN INICIAL
-- =============================================================================

INSERT INTO academ.periodo_academico (codigo, nombre, fecha_inicio, fecha_fin, estado)
VALUES ('2024-1', 'Enero-Junio 2024', '2024-01-15', '2024-06-30', 'cerrado');

INSERT INTO academ.docente (num_empleado, nombre, apellido_pat, apellido_mat, email)
VALUES ('D001', 'Carlos', 'Martínez', 'García', 'c.martinez@escuela.edu');

INSERT INTO academ.materia (clave, nombre, creditos)
VALUES
    ('ISC-301', 'Programación Orientada a Objetos', 6),
    ('ISC-401', 'Bases de Datos',                  5);

INSERT INTO academ.carrera (clave, nombre)
VALUES ('ISC', 'Ingeniería en Sistemas Computacionales');

INSERT INTO academ.plan_estudio (carrera_id, nombre, vigente)
SELECT id, 'Plan de demostración', TRUE
FROM academ.carrera
WHERE clave = 'ISC';

INSERT INTO academ.plan_materia
    (plan_estudio_id, materia_id, clave, semestre, orden, obligatoria)
SELECT pe.id, m.id, m.clave,
       CASE m.clave WHEN 'ISC-301' THEN 3 ELSE 4 END,
       1, TRUE
FROM academ.plan_estudio pe
JOIN academ.carrera c ON c.id = pe.carrera_id AND c.clave = 'ISC'
JOIN academ.materia m ON m.clave IN ('ISC-301', 'ISC-401')
WHERE pe.nombre = 'Plan de demostración';

INSERT INTO academ.alumno (no_control, nombre, apellido_pat, apellido_mat)
VALUES
    ('A001', 'Juan',   'García',    'López'),
    ('A002', 'María',  'Hernández', 'Ruiz'),
    ('A003', 'Pedro',  'Torres',    'Sánchez'),
    ('A004', 'Laura',  'Jiménez',   'Flores'),
    ('A005', 'Carlos', 'Ramírez',   'Cruz');

UPDATE academ.alumno
SET plan_estudio_id = (
    SELECT pe.id
    FROM academ.plan_estudio pe
    JOIN academ.carrera c ON c.id = pe.carrera_id
    WHERE c.clave = 'ISC' AND pe.nombre = 'Plan de demostración'
);

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================

DO $$
DECLARE v_tablas INT; v_funciones INT; v_triggers INT; v_vistas INT; v_procs INT;
BEGIN
    SELECT COUNT(*) INTO v_tablas    FROM information_schema.tables    WHERE table_schema='academ' AND table_type='BASE TABLE';
    SELECT COUNT(*) INTO v_funciones FROM information_schema.routines  WHERE routine_schema='academ' AND routine_type='FUNCTION';
    SELECT COUNT(*) INTO v_triggers  FROM information_schema.triggers  WHERE trigger_schema='academ';
    SELECT COUNT(*) INTO v_vistas    FROM information_schema.views     WHERE table_schema='academ';
    SELECT COUNT(*) INTO v_procs     FROM information_schema.routines  WHERE routine_schema='academ' AND routine_type='PROCEDURE';

    RAISE NOTICE '=== RESUMEN DE OBJETOS CREADOS ===';
    RAISE NOTICE '  Tablas    : %', v_tablas;
    RAISE NOTICE '  Funciones : %', v_funciones;
    RAISE NOTICE '  Triggers  : %', v_triggers;
    RAISE NOTICE '  Vistas    : %', v_vistas;
    RAISE NOTICE '  Procedures: %', v_procs;
    RAISE NOTICE '==================================';
END;
$$;

-- =============================================================================
-- MIGRACIÓN 002: AUTENTICACIÓN Y RBAC
-- Ejecutar DESPUÉS de schema_v2.sql (y opcionalmente después de simulacion.sql)
-- =============================================================================
-- Qué hace esta migración:
--   1. Crea tabla usuario  (identidad de acceso: email + contraseña)
--   2. Crea tabla rol      (catálogo de roles del sistema)
--   3. Crea tabla usuario_rol (N:M usuario ↔ rol)
--   4. Agrega columna usuario_id a alumno  (nullable)
--   5. Agrega columna usuario_id a docente (nullable)
--   6. Agrega FK de auditoria_log.usuario_app → usuario.id
--   7. Crea índices
--   8. Crea trigger de auditoría para asignación/revocación de roles
--   9. Crea función fn_roles_usuario()
--  10. Crea vista v_usuarios
--  11. Inserta roles iniciales (ADMIN, DOCENTE, ALUMNO)
--  12. Inserta usuario administrador por defecto
--
-- DISEÑO:
--   usuario  → solo autenticación (quién entra al sistema)
--   rol      → catálogo de permisos
--   usuario_rol → un usuario puede tener VARIOS roles simultáneamente
--                 Ej: un coordinador puede ser DOCENTE y ADMIN al mismo tiempo
--
--   alumno.usuario_id  → nullable: un alumno puede existir en el sistema
--                        sin tener cuenta de acceso (datos históricos)
--   docente.usuario_id → ídem
--
--   La dirección de la FK es deliberada:
--     ✓ alumno → usuario   (el dominio referencia a la identidad)
--     ✗ usuario → alumno   (la identidad NO debe conocer el dominio)
-- =============================================================================

SET search_path = academ, public;

-- =============================================================================
-- 1. TABLA USUARIO
-- =============================================================================

CREATE TABLE academ.usuario (
    id            UUID         PRIMARY KEY DEFAULT uuidv7(),
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_acceso TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_usuario_email UNIQUE (email),
    CONSTRAINT chk_usuario_email CHECK (
        email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
    )
);

COMMENT ON TABLE  academ.usuario               IS 'Identidad de acceso al sistema. Solo maneja autenticación (email + contraseña).';
COMMENT ON COLUMN academ.usuario.id            IS 'UUIDv7: opaco para enumeración, ordenable por tiempo de creación.';
COMMENT ON COLUMN academ.usuario.password_hash IS 'Hash bcrypt de la contraseña. Nunca se almacena en texto plano.';

-- =============================================================================
-- 2. CATÁLOGO DE ROLES
-- =============================================================================

CREATE TABLE academ.rol (
    id          UUID         PRIMARY KEY DEFAULT uuidv7(),
    nombre      VARCHAR(50)  NOT NULL,
    descripcion VARCHAR(200),

    CONSTRAINT uq_rol_nombre UNIQUE (nombre)
);

COMMENT ON TABLE academ.rol IS 'Catálogo de roles del sistema. Separado de usuario para soportar multi-rol.';

-- =============================================================================
-- 3. RELACIÓN N:M USUARIO ↔ ROL
-- =============================================================================

CREATE TABLE academ.usuario_rol (
    usuario_id   UUID        NOT NULL REFERENCES academ.usuario(id) ON DELETE CASCADE,
    rol_id       UUID        NOT NULL REFERENCES academ.rol(id)     ON DELETE RESTRICT,
    asignado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    asignado_por UUID        REFERENCES academ.usuario(id),   -- quién asignó el rol

    PRIMARY KEY (usuario_id, rol_id)
);

COMMENT ON TABLE academ.usuario_rol IS 'Un usuario puede tener múltiples roles. Ej: DOCENTE y ADMIN simultáneamente.';

-- =============================================================================
-- 4. VINCULAR ALUMNO Y DOCENTE CON USUARIO (columna nullable)
-- =============================================================================

ALTER TABLE academ.alumno
    ADD COLUMN usuario_id UUID REFERENCES academ.usuario(id),
    ADD CONSTRAINT uq_alumno_usuario_id UNIQUE (usuario_id);

ALTER TABLE academ.docente
    ADD COLUMN usuario_id UUID REFERENCES academ.usuario(id),
    ADD CONSTRAINT uq_docente_usuario_id UNIQUE (usuario_id);

COMMENT ON COLUMN academ.alumno.usuario_id
    IS 'Nullable: un alumno puede existir en el sistema sin tener cuenta de acceso.';
COMMENT ON COLUMN academ.docente.usuario_id
    IS 'Nullable: un docente puede estar registrado sin tener cuenta de acceso al sistema.';

-- =============================================================================
-- 5. FK EN AUDITORÍA: usuario_app → usuario.id
-- La columna ya existe como UUID en schema_v2.sql; solo se agrega la FK.
-- =============================================================================

ALTER TABLE academ.auditoria_log
    ADD CONSTRAINT fk_audit_usuario_app
        FOREIGN KEY (usuario_app) REFERENCES academ.usuario(id)
        ON DELETE SET NULL;

-- =============================================================================
-- 6. ÍNDICES
-- =============================================================================

CREATE INDEX idx_usuario_email        ON academ.usuario(email);
CREATE INDEX idx_usuario_activo       ON academ.usuario(activo) WHERE activo = TRUE;

CREATE INDEX idx_usuario_rol_usuario  ON academ.usuario_rol(usuario_id);
CREATE INDEX idx_usuario_rol_rol      ON academ.usuario_rol(rol_id);

CREATE INDEX idx_alumno_usuario       ON academ.alumno(usuario_id);
CREATE INDEX idx_docente_usuario      ON academ.docente(usuario_id);

-- =============================================================================
-- 7. FUNCIÓN AUXILIAR: roles de un usuario como array
-- =============================================================================

CREATE OR REPLACE FUNCTION academ.fn_roles_usuario(p_usuario_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(array_agg(r.nombre ORDER BY r.nombre), ARRAY[]::TEXT[])
    FROM   academ.usuario_rol ur
    JOIN   academ.rol         r ON r.id = ur.rol_id
    WHERE  ur.usuario_id = p_usuario_id;
$$;

COMMENT ON FUNCTION academ.fn_roles_usuario IS
    'Retorna los roles de un usuario como array de texto. Ej: {ADMIN, DOCENTE}';

-- =============================================================================
-- 8. TRIGGER DE AUDITORÍA PARA ASIGNACIÓN / REVOCACIÓN DE ROLES
-- =============================================================================

CREATE OR REPLACE FUNCTION academ.fn_tg_audit_usuario_rol()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_rol_nombre VARCHAR(50);
BEGIN
    SELECT nombre INTO v_rol_nombre
    FROM   academ.rol
    WHERE  id = COALESCE(NEW.rol_id, OLD.rol_id);

    PERFORM academ.fn_log_auditoria(
        'usuario_rol',
        COALESCE(NEW.usuario_id, OLD.usuario_id)::TEXT,
        CASE TG_OP WHEN 'INSERT' THEN 'ROL_ASIGNADO' ELSE 'ROL_REVOCADO' END,
        CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' THEN to_jsonb(NEW) ELSE NULL END,
        COALESCE(NEW.asignado_por, OLD.usuario_id),
        'Rol: ' || v_rol_nombre
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tg_usuario_rol_audit
    AFTER INSERT OR DELETE ON academ.usuario_rol
    FOR EACH ROW EXECUTE FUNCTION academ.fn_tg_audit_usuario_rol();

-- =============================================================================
-- 9. VISTA CONVENIENTE: usuarios con roles y perfil académico
-- =============================================================================

CREATE OR REPLACE VIEW academ.v_usuarios AS
SELECT
    u.id,
    u.email,
    u.activo,
    u.ultimo_acceso,
    academ.fn_roles_usuario(u.id)              AS roles,
    al.id                                       AS alumno_id,
    al.nombre || ' ' || al.apellido_pat         AS alumno_nombre,
    al.no_control,
    d.id                                        AS docente_id,
    d.nombre  || ' ' || d.apellido_pat          AS docente_nombre,
    d.num_empleado
FROM academ.usuario u
LEFT JOIN academ.alumno  al ON al.usuario_id = u.id
LEFT JOIN academ.docente d  ON d.usuario_id  = u.id;

COMMENT ON VIEW academ.v_usuarios IS
    'Vista consolidada: usuario + sus roles + su perfil académico (alumno o docente)';

-- =============================================================================
-- 10. DATOS INICIALES
-- =============================================================================

-- Roles del sistema
INSERT INTO academ.rol (nombre, descripcion) VALUES
    ('ADMIN',   'Administrador: acceso total al sistema'),
    ('DOCENTE', 'Docente: opera únicamente sobre sus grupos asignados'),
    ('ALUMNO',  'Alumno: lectura de sus propios resultados');

-- La cuenta administrativa inicial se crea de forma explícita mediante
-- backend/scripts/crear_administrador.py. El esquema no incluye credenciales.

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================

DO $$
DECLARE
    v_usuarios   INT;
    v_roles      INT;
    v_usr_roles  INT;
    v_col_al     BOOLEAN;
    v_col_doc    BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO v_usuarios  FROM academ.usuario;
    SELECT COUNT(*) INTO v_roles     FROM academ.rol;
    SELECT COUNT(*) INTO v_usr_roles FROM academ.usuario_rol;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='academ' AND table_name='alumno' AND column_name='usuario_id'
    ) INTO v_col_al;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='academ' AND table_name='docente' AND column_name='usuario_id'
    ) INTO v_col_doc;

    RAISE NOTICE '=== MIGRACIÓN 002 COMPLETADA ===';
    RAISE NOTICE '  Usuarios creados    : %', v_usuarios;
    RAISE NOTICE '  Roles disponibles   : %', v_roles;
    RAISE NOTICE '  Asignaciones rol    : %', v_usr_roles;
    RAISE NOTICE '  alumno.usuario_id   : %', CASE WHEN v_col_al  THEN 'OK' ELSE 'FALTANTE' END;
    RAISE NOTICE '  docente.usuario_id  : %', CASE WHEN v_col_doc THEN 'OK' ELSE 'FALTANTE' END;
    RAISE NOTICE '================================';
END;
$$;


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
    v_usuario_docente_id UUID;
    v_poo_id        INT;
    v_bd_id         INT;
    v_poo_pm_id     INT;
    v_bd_pm_id      INT;
    v_garcia_id     UUID;
    v_hernandez_id  UUID;
    v_torres_id     UUID;
    v_jimenez_id    UUID;
    v_ramirez_id    UUID;

    -- Rol docente

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
SELECT pm.id INTO v_poo_pm_id
FROM academ.plan_materia pm
JOIN academ.materia m ON m.id = pm.materia_id
WHERE m.clave = 'ISC-301';
SELECT pm.id INTO v_bd_pm_id
FROM academ.plan_materia pm
JOIN academ.materia m ON m.id = pm.materia_id
WHERE m.clave = 'ISC-401';
SELECT id INTO v_garcia_id    FROM academ.alumno             WHERE no_control = 'A001';
SELECT id INTO v_hernandez_id FROM academ.alumno             WHERE no_control = 'A002';
SELECT id INTO v_torres_id    FROM academ.alumno             WHERE no_control = 'A003';
SELECT id INTO v_jimenez_id   FROM academ.alumno             WHERE no_control = 'A004';
SELECT id INTO v_ramirez_id   FROM academ.alumno             WHERE no_control = 'A005';

RAISE NOTICE 'Catálogos cargados.';

-- Actor interno deshabilitado para ejecutar el flujo demo con la misma autorización
-- que usa la API. Su contraseña es aleatoria, no se muestra y no puede reutilizarse.
INSERT INTO academ.usuario (email, password_hash, activo)
VALUES (
    'docente.demo@acadex.invalid',
    crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 12)),
    FALSE
)
RETURNING id INTO v_usuario_docente_id;

UPDATE academ.docente
SET usuario_id = v_usuario_docente_id
WHERE id = v_docente_id;

INSERT INTO academ.usuario_rol (usuario_id, rol_id)
SELECT v_usuario_docente_id, id
FROM academ.rol
WHERE nombre = 'DOCENTE';

PERFORM set_config('app.usuario_id', v_usuario_docente_id::TEXT, TRUE);

-- ─── BLOQUE 3: Grupos ─────────────────────────────────────────────────────────

INSERT INTO academ.grupo (nombre, plan_materia_id, docente_id, periodo_id, calificacion_maxima)
VALUES ('POO-A', v_poo_pm_id, v_docente_id, v_periodo_id, 100) RETURNING id INTO v_poo_a_id;

INSERT INTO academ.grupo (nombre, plan_materia_id, docente_id, periodo_id, calificacion_maxima)
VALUES ('POO-B', v_poo_pm_id, v_docente_id, v_periodo_id, 100) RETURNING id INTO v_poo_b_id;

INSERT INTO academ.grupo (nombre, plan_materia_id, docente_id, periodo_id, calificacion_maxima)
VALUES ('BD-A',  v_bd_pm_id,  v_docente_id, v_periodo_id, 100) RETURNING id INTO v_bd_a_id;

INSERT INTO academ.grupo (nombre, plan_materia_id, docente_id, periodo_id, calificacion_maxima)
VALUES ('BD-B',  v_bd_pm_id,  v_docente_id, v_periodo_id, 100) RETURNING id INTO v_bd_b_id;

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

INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_a_u1, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Examen'), 50) RETURNING id INTO v_a_poo_a_u1_examen;
INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_a_u1, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Práctica'), 35) RETURNING id INTO v_a_poo_a_u1_practica;
INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_a_u1, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Tarea'), 15) RETURNING id INTO v_a_poo_a_u1_tarea;

INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_a_u2, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Examen'), 60) RETURNING id INTO v_a_poo_a_u2_examen;
INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_a_u2, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Proyecto'), 40) RETURNING id INTO v_a_poo_a_u2_proyecto;

INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_a_u3, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Proyecto'), 70) RETURNING id INTO v_a_poo_a_u3_proyecto;
INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_a_u3, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Participación'), 30) RETURNING id INTO v_a_poo_a_u3_present;

-- ─── BLOQUE 7: Actividades POO-B (Estandarizadas: un tipo por unidad) ──────────
-- U1: Se unifican tareas (30+30+30) en una sola de 90%
INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_b_u1, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Tarea'), 90) RETURNING id INTO v_a_poo_b_u1_t1;
INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_b_u1, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Participación'), 10) RETURNING id INTO v_a_poo_b_u1_part;

-- U2: Se unifican exámenes (40+25) en uno de 65%
INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_b_u2, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Examen'), 65) RETURNING id INTO v_a_poo_b_u2_examen;
INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_b_u2, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Tarea'), 35) RETURNING id INTO v_a_poo_b_u2_mapa;

INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_b_u3, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Proyecto'), 60) RETURNING id INTO v_a_poo_b_u3_proyecto;
INSERT INTO academ.actividad (unidad_id, tipo_catalogo_id, ponderacion) VALUES (v_poo_b_u3, (SELECT id FROM academ.tipo_actividad_catalogo WHERE nombre = 'Participación'), 40) RETURNING id INTO v_a_poo_b_u3_defensa;

-- El conjunto demo representa actividades que ya eran visibles antes del contrato de borradores.
UPDATE academ.actividad a
SET publicada = TRUE
FROM academ.unidad u
WHERE u.id = a.unidad_id
  AND u.grupo_id IN (v_poo_a_id, v_poo_b_id);

-- Verificar ponderaciones
PERFORM 1 FROM academ.v_suma_ponderaciones
WHERE grupo_id IN (v_poo_a_id, v_poo_b_id)
  AND estructura_completa = FALSE;

IF FOUND THEN
    RAISE EXCEPTION 'ERROR: Alguna unidad no tiene ponderaciones que sumen 100%%';
END IF;

RAISE NOTICE 'OK: Todas las ponderaciones suman 100%%.';

-- ─── BLOQUE 8: Calificaciones POO-A ──────────────────────────────────────────
-- García:    85×0.50 + 90×0.35 + 100×0.15 = 89.0
-- Hernández: 65×0.50 + 70×0.35 + 0×0.15   = 57.0
-- Torres:    90×0.50 + 85×0.35 + 70×0.15  = 85.25

CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u1_examen,   85,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u1_practica, 90,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u1_tarea,    100, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u1_examen,   65, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u1_practica, 70, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u1_tarea,    0,   'NP',        v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u1_examen,   90, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u1_practica, 85, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u1_tarea,    70, 'ENTREGADA', v_docente_id);

-- Unidad 2: García=77.0  Hernández=54.0  Torres=84.0
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u2_examen,   75, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u2_proyecto, 80, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u2_examen,   50, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u2_proyecto, 60, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u2_examen,   80, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u2_proyecto, 90, 'ENTREGADA', v_docente_id);

-- Unidad 3: García=90.5  Hernández=71.5  Torres=97.0
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u3_proyecto, 95,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_garcia_poo_a,    v_a_poo_a_u3_present,  80,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u3_proyecto, 70,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_hernandez_poo_a, v_a_poo_a_u3_present,  75,  'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u3_proyecto, 100, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_torres_poo_a,    v_a_poo_a_u3_present,  90,  'ENTREGADA', v_docente_id);

-- ─── BLOQUE 9: Bonus y Cierre de unidades POO-A ────────────────────────────────
-- Hernández U1: 57.0 + 5.0 = 62.0 (Se debe aplicar antes de cerrar la unidad)
CALL academ.sp_aplicar_bonus_unidad(
    v_insc_hernandez_poo_a, v_poo_a_u1,
    5, 'Participación extra en laboratorio',
    v_docente_id
);

CALL academ.sp_cerrar_unidad(v_poo_a_u1, v_docente_id, FALSE);
CALL academ.sp_cerrar_unidad(v_poo_a_u2, v_docente_id, FALSE);
CALL academ.sp_cerrar_unidad(v_poo_a_u3, v_docente_id, FALSE);

RAISE NOTICE 'Unidades POO-A cerradas y bonus aplicado.';

-- ─── BLOQUE 10: Sello de Materia POO-A (Flujo: ACTIVO -> PRECIERRE -> FINALIZADO) ──
-- García:    (89.0+77.0+90.5)/3 = 85.5
-- Hernández: (62.0+54.0+71.5)/3 = 62.5
-- Torres:    (85.25+84.0+97.0)/3 = 88.75

-- 1. Mover a PRECIERRE para habilitar arbitraje (Overrides / Bonus Materia)
CALL academ.sp_pre_cerrar_materia(v_poo_a_id, v_docente_id);

-- 2. Aplicar Override (Sólo permitido en PRECIERRE)
CALL academ.sp_override_resultado_materia(
    v_insc_torres_poo_a,
    90,
    'Alumno con trabajo de titulación simultáneo, ajuste según reglamento institucional artículo 45.',
    v_docente_id
);
-- 3. Sello Definitivo (FINALIZADO)
CALL academ.sp_finalizar_materia(v_poo_a_id, v_docente_id);

RAISE NOTICE 'POO-A finalizado correctamente (Precierre -> Override -> Sello Final).';

-- ─── BLOQUE 12: Calificaciones y cierre POO-B ────────────────────────────────

CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u1_t1,   82, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u1_part, 85, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u1_t1,   62, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u1_part, 65, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u2_examen, 88, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u2_mapa,   80, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u2_examen, 72, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u2_mapa,   65, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u3_proyecto, 95, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_jimenez_poo_b, v_a_poo_b_u3_defensa,  85, 'ENTREGADA', v_docente_id);

CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u3_proyecto, 75, 'ENTREGADA', v_docente_id);
CALL academ.sp_registrar_calificacion(v_insc_ramirez_poo_b, v_a_poo_b_u3_defensa,  80, 'ENTREGADA', v_docente_id);

-- 3. Cierre de unidades
CALL academ.sp_cerrar_unidad(v_poo_b_u1, v_docente_id, FALSE);
CALL academ.sp_cerrar_unidad(v_poo_b_u2, v_docente_id, FALSE);
CALL academ.sp_cerrar_unidad(v_poo_b_u3, v_docente_id, FALSE);

-- 4. Precierre y Sello Final
CALL academ.sp_pre_cerrar_materia(v_poo_b_id, v_docente_id);
CALL academ.sp_finalizar_materia(v_poo_b_id, v_docente_id);

RAISE NOTICE 'POO-B finalizado correctamente (Precierre -> Sello Final).';
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
WHERE al.no_control = 'A001' AND g.nombre = 'POO-A'
ORDER BY u.numero;

SELECT '=== Q2: RESULTADOS FINALES POO-A ===' AS info;
SELECT alumno, promedio_base, bonus_materia,
       resultado_calculado, resultado_override, resultado_final, estatus
FROM academ.v_resultados_finales
WHERE grupo = 'POO-A' ORDER BY alumno;

SELECT '=== Q3: HETEROGENEIDAD POO-A vs POO-B ===' AS info;
SELECT g.nombre AS grupo, u.numero, c.nombre AS actividad, a.ponderacion
FROM academ.actividad a
JOIN academ.unidad u ON u.id = a.unidad_id
JOIN academ.grupo  g ON g.id = u.grupo_id
LEFT JOIN academ.tipo_actividad_catalogo c ON c.id = a.tipo_catalogo_id
WHERE g.nombre IN ('POO-A','POO-B') AND a.activa = TRUE
ORDER BY g.nombre, u.numero, a.id;

SELECT '=== Q4: IMPACTO BONUS — Hernández U1 ===' AS info;
SELECT al.nombre || ' ' || al.apellido_pat AS alumno,
       u.nombre AS unidad,
       ru.promedio_base AS sin_bonus, ru.bonus_aplicado, ru.resultado_final AS con_bonus
FROM academ.resultado_unidad ru
JOIN academ.unidad      u  ON u.id  = ru.unidad_id
JOIN academ.inscripcion i  ON i.id  = ru.inscripcion_id
JOIN academ.alumno      al ON al.id = i.alumno_id
JOIN academ.grupo       g  ON g.id  = i.grupo_id
WHERE al.no_control = 'A002' AND g.nombre = 'POO-A' AND u.numero = 1;

SELECT '=== Q5: OVERRIDE — Torres POO-A ===' AS info;
SELECT alumno, resultado_calculado, resultado_override, resultado_final, estatus
FROM academ.v_resultados_finales
WHERE no_control = 'A003' AND grupo = 'POO-A';

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
    WHERE al.no_control='A004' AND g.nombre='POO-B';

    SELECT a.id INTO v_act FROM academ.actividad a
    JOIN academ.unidad u ON u.id=a.unidad_id
    JOIN academ.grupo  g ON g.id=u.grupo_id
    JOIN academ.tipo_actividad_catalogo c ON c.id=a.tipo_catalogo_id
    WHERE g.nombre='POO-A' AND u.numero=1 AND c.nombre='Examen';

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
