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
--
-- Orden de ejecución:
--   1. schemav3.sql          ← este archivo
--   2. simulacion.sql        ← datos de ejemplo (opcional)
--   3. 002_rbac.sql          ← autenticación y RBAC
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
    activo       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_periodo_codigo  UNIQUE (codigo),
    CONSTRAINT chk_periodo_fechas CHECK (fecha_fin > fecha_inicio)
);

COMMENT ON TABLE  periodo_academico        IS 'Periodos académicos (semestres, cuatrimestres, etc.)';
COMMENT ON COLUMN periodo_academico.codigo IS 'Clave única del periodo, ej: 2024-1, 2024A';

-- -------------------------------------
-- A2. ALUMNO
-- usuario_id se agrega en la migración 002_rbac.sql mediante ALTER TABLE
-- -------------------------------------
CREATE TABLE alumno (
    id           UUID         PRIMARY KEY DEFAULT uuidv7(),
    matricula    VARCHAR(20)  NOT NULL,
    nombre       VARCHAR(100) NOT NULL,
    apellido_pat VARCHAR(100) NOT NULL,
    apellido_mat VARCHAR(100),
    email        VARCHAR(150),
    activo       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_alumno_matricula UNIQUE (matricula),
    CONSTRAINT uq_alumno_email     UNIQUE (email),
    CONSTRAINT chk_alumno_email    CHECK (
        email IS NULL OR
        email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
    )
);

COMMENT ON TABLE alumno IS 'Catálogo de alumnos de la institución';

-- -------------------------------------
-- A3. DOCENTE
-- usuario_id se agrega en la migración 002_rbac.sql mediante ALTER TABLE
-- -------------------------------------
CREATE TABLE docente (
    id           UUID         PRIMARY KEY DEFAULT uuidv7(),
    num_empleado VARCHAR(20)  NOT NULL,
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
-- A4. MATERIA
-- -------------------------------------
CREATE TABLE materia (
    id         SERIAL       PRIMARY KEY,
    clave      VARCHAR(20)  NOT NULL,
    nombre     VARCHAR(200) NOT NULL,
    creditos   SMALLINT     CHECK (creditos > 0),
    activa     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_materia_clave UNIQUE (clave)
);

COMMENT ON TABLE materia IS 'Catálogo de materias/asignaturas';

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
    materia_id          INT          NOT NULL REFERENCES materia(id),
    docente_id          UUID         NOT NULL REFERENCES docente(id),
    periodo_id          INT          NOT NULL REFERENCES periodo_academico(id),
    calificacion_maxima NUMERIC(6,3) NOT NULL DEFAULT 100.00,
    estado              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_grupo_nombre_materia_periodo UNIQUE (nombre, materia_id, periodo_id),
    CONSTRAINT chk_grupo_estado                CHECK (estado IN ('ACTIVO','PRE_CIERRE','FINALIZADO')),
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
-- B3. ACTIVIDAD
-- Existe SOLO en el contexto de una unidad de un grupo.
-- La ponderación pertenece a la actividad (que ya es contextual).
-- -------------------------------------
CREATE TABLE actividad (
    id          SERIAL       PRIMARY KEY,
    unidad_id   INT          NOT NULL REFERENCES unidad(id),
    nombre      VARCHAR(200) NOT NULL,
    ponderacion NUMERIC(6,3) NOT NULL,   -- 0.001 a 100.000
    orden       SMALLINT     NOT NULL DEFAULT 1,
    activa      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_actividad_ponderacion CHECK (ponderacion > 0 AND ponderacion <= 100)
);

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
            'MATERIA_PRE_CIERRE','MATERIA_FINALIZADA','RECALCULO',
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
CREATE INDEX idx_alumno_matricula ON alumno(matricula);
CREATE INDEX idx_alumno_nombre    ON alumno USING gin(to_tsvector('spanish', nombre || ' ' || apellido_pat));

-- Grupos
CREATE INDEX idx_grupo_materia ON grupo(materia_id);
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
BEGIN
    -- Obtener escala máxima del grupo
    SELECT g.calificacion_maxima
    INTO   v_cal_max
    FROM   academ.inscripcion i
    JOIN   academ.grupo       g ON g.id = i.grupo_id
    WHERE  i.id = p_inscripcion_id;

    -- Calcular promedio ponderado base
    SELECT COALESCE(SUM(COALESCE(ra.calificacion, 0) * (a.ponderacion / 100.0)), 0)
    INTO   v_base
    FROM   academ.actividad a
    LEFT JOIN academ.resultado_actividad ra
           ON ra.actividad_id   = a.id
          AND ra.inscripcion_id = p_inscripcion_id
    WHERE  a.unidad_id = p_unidad_id
      AND  a.activa    = TRUE;

    -- Obtener bonus de unidad (SELECT INTO deja NULL si no hay fila)
    SELECT COALESCE(monto, 0)
    INTO   v_bonus
    FROM   academ.bonus_unidad
    WHERE  inscripcion_id = p_inscripcion_id
      AND  unidad_id      = p_unidad_id;

    v_bonus := COALESCE(v_bonus, 0);   -- protección adicional si no hay fila

    -- Aplicar tope máximo
    v_final := LEAST(v_base + v_bonus, v_cal_max);

    -- Construir desglose JSON auditadle
    SELECT jsonb_agg(
        jsonb_build_object(
            'actividad_id',   a.id,
            'actividad',      a.nombre,
            'ponderacion',    a.ponderacion,
            'calificacion',   COALESCE(ra.calificacion, 0),
            'estado_entrega', COALESCE(ra.estado_entrega, 'NP'),
            'contribucion',   ROUND(COALESCE(ra.calificacion, 0) * (a.ponderacion / 100.0), 6)
        )
        ORDER BY a.orden
    )
    INTO v_desglose
    FROM academ.actividad a
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
           COALESCE(SUM(ru.resultado_final), 0) / NULLIF(v_total_unidades, 0)
    INTO   v_unid_con_result, v_promedio_base
    FROM   academ.unidad u
    JOIN   academ.inscripcion i ON i.grupo_id = u.grupo_id
    LEFT JOIN academ.resultado_unidad ru
           ON ru.unidad_id      = u.id
          AND ru.inscripcion_id = p_inscripcion_id
    WHERE  i.id = p_inscripcion_id;

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
        'matricula',               al.matricula,
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
                    'desglose_actividades', ru.desglose
                )
                ORDER BY u.numero
            )
            FROM   academ.unidad u
            LEFT JOIN academ.resultado_unidad ru
                   ON ru.unidad_id = u.id AND ru.inscripcion_id = i.id
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
-- TG01: updated_at automático en alumno, docente y grupo
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

    -- Leer UUID del usuario desde la configuración de sesión (establecida por el SP)
    BEGIN
        v_uid := current_setting('app.usuario_id', TRUE)::UUID;
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
        NULL,   -- usuario_app se pasa desde sp_aplicar_bonus_unidad cuando aplique
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
        NULL,
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

    IF v_docente_grupo <> p_docente_id THEN
        RAISE EXCEPTION 'El docente % no está autorizado para esta unidad.', p_docente_id
            USING ERRCODE = 'P0012';
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
BEGIN
    PERFORM set_config('app.usuario_id', p_docente_id::TEXT, TRUE);
    PERFORM set_config('app.motivo',     COALESCE(p_motivo, ''), TRUE);

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
    -- fila_num, matricula, nombre, apellido_pat, apellido_mat, email
    FOR v_fila IN SELECT * FROM tmp_importacion_alumnos ORDER BY fila_num
    LOOP
        BEGIN
            INSERT INTO academ.alumno (matricula, nombre, apellido_pat, apellido_mat, email)
            VALUES (v_fila.matricula, v_fila.nombre, v_fila.apellido_pat,
                    v_fila.apellido_mat, NULLIF(v_fila.email,''))
            ON CONFLICT (matricula) DO NOTHING;

            IF FOUND THEN v_ins  := v_ins  + 1;
            ELSE          v_omit := v_omit + 1;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_errores := v_errores || jsonb_build_object(
                'fila',      v_fila.fila_num,
                'matricula', v_fila.matricula,
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
    al.matricula,
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
JOIN academ.materia m  ON m.id  = g.materia_id
JOIN academ.unidad  u  ON u.grupo_id = g.id
LEFT JOIN academ.actividad             a  ON a.unidad_id = u.id AND a.activa = TRUE
LEFT JOIN academ.resultado_actividad   ra ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
LEFT JOIN academ.bonus_unidad          bu ON bu.inscripcion_id = i.id AND bu.unidad_id = u.id
LEFT JOIN academ.resultado_unidad      ru ON ru.inscripcion_id = i.id AND ru.unidad_id = u.id
WHERE i.estado = 'ACTIVA'
GROUP BY i.id, al.matricula, al.nombre, al.apellido_pat, g.id, g.nombre,
         m.nombre, u.id, u.numero, u.nombre, u.estado,
         bu.monto, g.calificacion_maxima, ru.resultado_final;

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
    al.matricula,
    al.nombre || ' ' || al.apellido_pat AS alumno,
    i.id     AS inscripcion_id,
    ROUND(rm.promedio_base, 2)       AS promedio_base,
    rm.bonus_aplicado                AS bonus_materia,
    ROUND(rm.resultado_calculado, 2) AS resultado_calculado,
    rm.resultado_override,
    ROUND(rm.resultado_final, 2)     AS resultado_final,
    CASE
        WHEN rm.resultado_final >= 6 THEN 'APROBADO'
        WHEN rm.resultado_final <  6 THEN 'REPROBADO'
        ELSE 'PENDIENTE'
    END AS estatus,
    rm.justificacion_override,
    rm.fecha_calculo
FROM academ.grupo              g
JOIN academ.materia            m  ON m.id  = g.materia_id
JOIN academ.periodo_academico  p  ON p.id  = g.periodo_id
JOIN academ.docente            d  ON d.id  = g.docente_id
JOIN academ.inscripcion        i  ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
JOIN academ.alumno             al ON al.id = i.alumno_id
LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
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
    a.nombre AS actividad,
    a.ponderacion,
    al.matricula,
    al.nombre || ' ' || al.apellido_pat AS alumno,
    i.id    AS inscripcion_id,
    ra.calificacion,
    ra.estado_entrega,
    CASE WHEN ra.id IS NULL THEN TRUE ELSE FALSE END AS pendiente
FROM academ.grupo       g
JOIN academ.unidad      u  ON u.grupo_id = g.id  AND u.estado = 'EDICION'
JOIN academ.actividad   a  ON a.unidad_id = u.id AND a.activa = TRUE
JOIN academ.inscripcion i  ON i.grupo_id  = g.id AND i.estado = 'ACTIVA'
JOIN academ.alumno      al ON al.id = i.alumno_id
LEFT JOIN academ.resultado_actividad ra
       ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
ORDER BY g.nombre, u.numero, a.orden, al.apellido_pat;

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

-- =============================================================================
-- SECCIÓN O: PILAR 1 — BORRADOR DE FINALIZADO Y SELLO DEFINITIVO (PRE_CIERRE)
-- =============================================================================
-- Flujo: ACTIVO -> PRE_CIERRE -> FINALIZADO
-- PRE_CIERRE permite arbitraje (bonus materia, overrides).
-- FINALIZADO bloquea TODO de raíz.
-- =============================================================================

COMMENT ON COLUMN grupo.estado IS
    'ACTIVO: captura normal. PRE_CIERRE: borrador de auditoría, permite arbitraje (bonus/overrides). FINALIZADO: sellado permanente, bloquea todo.';

-- -----------------------------------------------------------------------------
-- SP-NEW-01: Pre-cerrar materia (borrador)
--   Requisitos:
--     • El grupo debe estar en ACTIVO
--     • Todas las unidades deben estar CERRADAS (no EDICION)
--     • Genera snapshot tentativo en resultado_materia
--     • Cambia el estado del grupo a PRE_CIERRE
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
        RAISE EXCEPTION 'El grupo ya está en estado %. Solo se puede pre-cerrar desde ACTIVO.', v_estado_grupo
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
            'Hay % unidades en estado EDICION. Cierre todas las unidades antes de pre-cerrar la materia.',
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

    -- Cambiar estado a PRE_CIERRE
    UPDATE academ.grupo SET estado = 'PRE_CIERRE', updated_at = NOW() WHERE id = p_grupo_id;

    PERFORM academ.fn_log_auditoria(
        'grupo', p_grupo_id::TEXT, 'MATERIA_PRE_CIERRE',
        jsonb_build_object('estado', 'ACTIVO'),
        jsonb_build_object('estado', 'PRE_CIERRE', 'pre_cerrado_por', p_docente_id),
        NULL, NULL
    );

    RAISE NOTICE 'Grupo % en estado PRE_CIERRE. Ahora puede aplicar bonus de materia y overrides antes de sellar.', p_grupo_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- SP02-MOD: Sobreescritura de sp_finalizar_materia
--   MODIFICACIÓN: Ahora REQUIERE que el grupo esté en PRE_CIERRE (no ACTIVO)
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

    -- *** CAMBIO CLAVE: Solo se permite desde PRE_CIERRE ***
    IF v_estado_grupo <> 'PRE_CIERRE' THEN
        RAISE EXCEPTION 'El grupo debe estar en PRE_CIERRE para finalizar. Estado actual: %. Use sp_pre_cerrar_materia primero.', v_estado_grupo
            USING ERRCODE = 'P0020';
    END IF;

    IF v_docente_grupo <> p_docente_id THEN
        RAISE EXCEPTION 'El docente % no está autorizado para este grupo.', p_docente_id
            USING ERRCODE = 'P0021';
    END IF;

    -- Recalcular snapshots finales (por si hubo overrides/bonus durante PRE_CIERRE)
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
        jsonb_build_object('estado', 'PRE_CIERRE'),
        jsonb_build_object('estado', 'FINALIZADO', 'finalizado_por', p_docente_id),
        NULL, NULL
    );

    RAISE NOTICE 'Materia (grupo %) FINALIZADA y SELLADA. No se permiten más modificaciones.', p_grupo_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- SP04-MOD: Sobreescritura de sp_override_resultado_materia
--   MODIFICACIÓN: Ahora REQUIERE que el grupo esté en PRE_CIERRE.
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

    -- *** BLOQUEO: Solo en PRE_CIERRE ***
    IF v_estado_grupo = 'FINALIZADO' THEN
        RAISE EXCEPTION 'BLOQUEADO: La materia está FINALIZADA (Sello Definitivo). No se permiten overrides.'
            USING ERRCODE = 'P0044';
    END IF;

    IF v_estado_grupo <> 'PRE_CIERRE' THEN
        RAISE EXCEPTION 'Los overrides solo se permiten cuando el grupo está en PRE_CIERRE. Estado actual: %.', v_estado_grupo
            USING ERRCODE = 'P0045';
    END IF;

    IF v_docente_grupo <> p_docente_id THEN
        RAISE EXCEPTION 'Docente no autorizado para esta inscripción.' USING ERRCODE = 'P0041';
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
    v_faltan_calif  BOOLEAN;
BEGIN
    SELECT g.id, g.docente_id, g.estado, u.estado
    INTO   v_grupo_id, v_docente_grupo, v_estado_grupo, v_estado_unidad
    FROM   academ.inscripcion i
    JOIN   academ.grupo       g ON g.id = i.grupo_id
    JOIN   academ.unidad      u ON u.grupo_id = g.id AND u.id = p_unidad_id
    WHERE  i.id = p_inscripcion_id;

    IF v_docente_grupo <> p_docente_id THEN
        RAISE EXCEPTION 'Docente no autorizado para esta unidad.' USING ERRCODE = 'P0030';
    END IF;

    -- *** BLOQUEO TAJANTE: Unidad cerrada o finalizada ***
    IF v_estado_unidad IN ('CERRADA', 'FINALIZADA') THEN
        RAISE EXCEPTION 'BLOQUEADO: La unidad está en estado %. El bonus de unidad solo se puede aplicar mientras la unidad esté en EDICION.',
            v_estado_unidad USING ERRCODE = 'P0031';
    END IF;

    -- *** BLOQUEO: Grupo FINALIZADO ***
    IF v_estado_grupo = 'FINALIZADO' THEN
        RAISE EXCEPTION 'BLOQUEADO: La materia está FINALIZADA (Sello Definitivo). No se permiten modificaciones.'
            USING ERRCODE = 'P0034';
    END IF;

    IF p_monto < 0 THEN
        RAISE EXCEPTION 'El monto del bonus debe ser mayor o igual a cero.' USING ERRCODE = 'P0032';
    END IF;

    -- *** VALIDACIÓN 100%: Cruce matricial alumnos × actividades ***
    -- Verificar que NO exista ningún par (alumno_inscrito, actividad_activa) sin calificación
    SELECT EXISTS (
        SELECT 1
        FROM   academ.inscripcion i2
        CROSS JOIN academ.actividad a
        LEFT JOIN academ.resultado_actividad ra
               ON ra.inscripcion_id = i2.id AND ra.actividad_id = a.id
        WHERE  i2.grupo_id  = v_grupo_id
          AND  i2.estado    = 'ACTIVA'
          AND  a.unidad_id  = p_unidad_id
          AND  a.activa     = TRUE
          AND  ra.id IS NULL
    ) INTO v_faltan_calif;

    IF v_faltan_calif THEN
        RAISE EXCEPTION 'BLOQUEADO: No se puede aplicar bonus. Faltan calificaciones por capturar en esta unidad. Debe tener 100%% de captura antes de aplicar bonus.'
            USING ERRCODE = 'P0033';
    END IF;

    INSERT INTO academ.bonus_unidad
        (inscripcion_id, unidad_id, monto, justificacion, aplicado_por)
    VALUES
        (p_inscripcion_id, p_unidad_id, p_monto, p_justificacion, p_docente_id)
    ON CONFLICT (inscripcion_id, unidad_id) DO UPDATE SET
        monto            = EXCLUDED.monto,
        justificacion    = EXCLUDED.justificacion,
        aplicado_por     = EXCLUDED.aplicado_por,
        fecha_aplicacion = NOW();

    RAISE NOTICE 'Bonus de % aplicado a inscripcion % en unidad %.', p_monto, p_inscripcion_id, p_unidad_id;
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

    -- Bonus de materia solo permitido en PRE_CIERRE
    IF v_estado_grupo <> 'PRE_CIERRE' THEN
        RAISE EXCEPTION 'Los bonus de materia solo se permiten cuando el grupo está en PRE_CIERRE. Estado actual: %.',
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

INSERT INTO academ.periodo_academico (codigo, nombre, fecha_inicio, fecha_fin)
VALUES ('2024-1', 'Enero-Junio 2024', '2024-01-15', '2024-06-30');

INSERT INTO academ.docente (num_empleado, nombre, apellido_pat, apellido_mat, email)
VALUES ('D001', 'Carlos', 'Martínez', 'García', 'c.martinez@escuela.edu');

INSERT INTO academ.materia (clave, nombre, creditos)
VALUES
    ('ISC-301', 'Programación Orientada a Objetos', 6),
    ('ISC-401', 'Bases de Datos',                  5);

INSERT INTO academ.alumno (matricula, nombre, apellido_pat, apellido_mat)
VALUES
    ('A001', 'Juan',   'García',    'López'),
    ('A002', 'María',  'Hernández', 'Ruiz'),
    ('A003', 'Pedro',  'Torres',    'Sánchez'),
    ('A004', 'Laura',  'Jiménez',   'Flores'),
    ('A005', 'Carlos', 'Ramírez',   'Cruz');

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

