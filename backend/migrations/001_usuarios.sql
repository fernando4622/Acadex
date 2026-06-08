-- =============================================================================
-- MIGRACIÓN 001: Tabla de usuarios del sistema
-- Ejecutar DESPUÉS de schema.sql
-- =============================================================================
SET search_path = academ, public;

CREATE TABLE usuario (
    id              SERIAL          PRIMARY KEY,
    email           VARCHAR(150)    NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    rol             VARCHAR(20)     NOT NULL,
    alumno_id       INT             REFERENCES academ.alumno(id),
    docente_id      INT             REFERENCES academ.docente(id),
    activo          BOOLEAN         NOT NULL DEFAULT TRUE,
    ultimo_acceso   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_usuario_email         UNIQUE (email),
    CONSTRAINT chk_usuario_rol          CHECK (rol IN ('ADMIN','DOCENTE','ALUMNO')),
    CONSTRAINT chk_usuario_una_entidad  CHECK (
        (alumno_id IS NULL AND docente_id IS NULL)
        OR (alumno_id IS NOT NULL AND docente_id IS NULL)
        OR (alumno_id IS NULL AND docente_id IS NOT NULL)
    )
);

CREATE INDEX idx_usuario_email   ON academ.usuario(email);
CREATE INDEX idx_usuario_docente ON academ.usuario(docente_id);
CREATE INDEX idx_usuario_alumno  ON academ.usuario(alumno_id);

-- Admin por defecto (password: Admin1234!)
INSERT INTO academ.usuario (email, password_hash, rol)
VALUES ('admin@escuela.edu',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2Ixqn8P4gS',
        'ADMIN');
