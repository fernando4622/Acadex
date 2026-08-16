-- Catálogos vigentes para relacionar carreras, planes y materias.
-- No recrea la tabla histórica materia_carrera.

CREATE TABLE IF NOT EXISTS academ.carrera (
    id          SERIAL       PRIMARY KEY,
    clave       VARCHAR(10)  NOT NULL UNIQUE,
    nombre      VARCHAR(150) NOT NULL,
    descripcion TEXT,
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academ.plan_estudio (
    id         SERIAL      PRIMARY KEY,
    carrera_id INT         NOT NULL REFERENCES academ.carrera(id),
    nombre     TEXT        NOT NULL,
    vigente    BOOLEAN     DEFAULT TRUE,
    created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS academ.plan_materia (
    id                 SERIAL    PRIMARY KEY,
    plan_estudio_id     INT       NOT NULL REFERENCES academ.plan_estudio(id),
    materia_id          INT       NOT NULL REFERENCES academ.materia(id),
    clave               TEXT      NOT NULL,
    semestre            INT       NOT NULL,
    orden               INT       DEFAULT 0,
    obligatoria         BOOLEAN   DEFAULT TRUE,
    creditos_override   INT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_plan_materia_clave
        UNIQUE (plan_estudio_id, clave),
    CONSTRAINT uq_plan_materia_materia
        UNIQUE (plan_estudio_id, materia_id)
);

COMMENT ON TABLE academ.carrera IS
    'Catálogo institucional de carreras o programas académicos.';
COMMENT ON TABLE academ.plan_estudio IS
    'Versiones de planes de estudio pertenecientes a una carrera.';
COMMENT ON TABLE academ.plan_materia IS
    'Materias incluidas en un plan, con su clave, semestre y orden curricular.';
