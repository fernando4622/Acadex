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
    al.matricula,
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

-- Usuario administrador por defecto
-- Contraseña: Admin1234!
-- Hash generado con bcrypt rounds=12
-- ⚠ CAMBIAR ESTA CONTRASEÑA EN EL PRIMER USO EN PRODUCCIÓN
DO $$
DECLARE
    v_usuario_id UUID;
    v_rol_id     UUID;
BEGIN
    INSERT INTO academ.usuario (email, password_hash)
    VALUES (
        'admin@escuela.edu',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2Ixqn8P4gS'
    )
    RETURNING id INTO v_usuario_id;

    SELECT id INTO v_rol_id FROM academ.rol WHERE nombre = 'ADMIN';

    INSERT INTO academ.usuario_rol (usuario_id, rol_id, asignado_por)
    VALUES (v_usuario_id, v_rol_id, v_usuario_id);  -- se auto-asigna
END;
$$;

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
