-- =============================================================================
-- MIGRACIÓN 004: REGISTRO DE ALUMNOS TECNM VERACRUZ
-- Ejecutar DESPUÉS de 003_expansion.sql
-- Idempotente: usa IF NOT EXISTS / OR REPLACE en todas las operaciones
-- =============================================================================
SET search_path = academ, public;

-- =============================================================================
-- SECCIÓN 1: CAMBIO EN TABLA USUARIO
-- Reemplaza email como campo de login por username (más genérico)
-- =============================================================================

-- 1A. Agregar columna username
ALTER TABLE academ.usuario
    ADD COLUMN IF NOT EXISTS username VARCHAR(50);

-- 1B. Para usuarios existentes, su username = su email actual
UPDATE academ.usuario
SET username = email
WHERE username IS NULL;

-- 1C. Hacer username NOT NULL y UNIQUE
ALTER TABLE academ.usuario
    ALTER COLUMN username SET NOT NULL;

ALTER TABLE academ.usuario
    DROP CONSTRAINT IF EXISTS uq_usuario_username;
ALTER TABLE academ.usuario
    ADD CONSTRAINT uq_usuario_username UNIQUE (username);

-- 1D. Hacer email NULLABLE (ya no es el campo de autenticación)
ALTER TABLE academ.usuario
    ALTER COLUMN email DROP NOT NULL;

-- 1E. Quitar constraints de formato de email
ALTER TABLE academ.usuario
    DROP CONSTRAINT IF EXISTS chk_usuario_email;
ALTER TABLE academ.usuario
    DROP CONSTRAINT IF EXISTS uq_usuario_email;

-- 1F. Índice para búsqueda por username
DROP INDEX IF EXISTS academ.idx_usuario_username;
CREATE INDEX idx_usuario_username ON academ.usuario(username);

COMMENT ON COLUMN academ.usuario.username IS
    'Identificador de acceso. Para alumnos = matricula (num_control). Para docentes = email.';

-- =============================================================================
-- SECCIÓN 2: EXTENSIÓN DE TABLA ALUMNO
-- matricula = número de control (ya existe, VARCHAR(8))
-- email = correo institucional auto-generado
-- Se agrega nip_hash para la contraseña provisional
-- =============================================================================

-- 2A. nip_hash para contraseña provisional
ALTER TABLE academ.alumno
    ADD COLUMN IF NOT EXISTS nip_hash VARCHAR(255);

COMMENT ON COLUMN academ.alumno.nip_hash IS
    'Hash bcrypt del NIP provisional (YYYYMMDD de fecha de nacimiento).';

-- 2B. Quitar constraint de email en alumno (ahora se genera automáticamente)
ALTER TABLE academ.alumno
    DROP CONSTRAINT IF EXISTS chk_alumno_email;

-- 2C. Ampliar matricula a VARCHAR(12) para dar margen al formato
ALTER TABLE academ.alumno
    ALTER COLUMN matricula TYPE VARCHAR(12);

-- =============================================================================
-- SECCIÓN 3: FUNCIONES AUXILIARES
-- =============================================================================

-- fn_generar_num_control ya existe en 003, genera el valor para matricula
-- Solo creamos la función de correo institucional

CREATE OR REPLACE FUNCTION academ.fn_generar_correo_institucional(p_matricula VARCHAR)
RETURNS VARCHAR
LANGUAGE sql IMMUTABLE AS $$
    SELECT 'L' || p_matricula || '@veracruz.tecnm.mx';
$$;

COMMENT ON FUNCTION academ.fn_generar_correo_institucional IS
    'Genera correo institucional: L{matricula}@veracruz.tecnm.mx';

-- =============================================================================
-- SECCIÓN 4: VERIFICACIÓN
-- =============================================================================
DO $$
DECLARE
    v_con_username  INT;
    v_total_usuario INT;
BEGIN
    SELECT COUNT(*) INTO v_total_usuario FROM academ.usuario;
    SELECT COUNT(*) INTO v_con_username  FROM academ.usuario WHERE username IS NOT NULL;

    RAISE NOTICE '=== MIGRACIÓN 004 COMPLETADA ===';
    RAISE NOTICE '  Usuarios totales      : %', v_total_usuario;
    RAISE NOTICE '  Con username asignado : %', v_con_username;
    RAISE NOTICE '  alumno.nip_hash       : ✓';
    RAISE NOTICE '  fn_generar_correo_institucional ✓';
    RAISE NOTICE '================================';
END;
$$;
