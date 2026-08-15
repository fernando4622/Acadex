import tempfile
import unittest
from pathlib import Path

from scripts.aplicar_migraciones import descubrir_migraciones


class MigrationDiscoveryTests(unittest.TestCase):
    def test_discovers_supported_migrations_in_numeric_order(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            (directory / "003_tercera.sql").write_text("SELECT 3;", encoding="utf-8")
            (directory / "002_segunda.sql").write_text("SELECT 2;", encoding="utf-8")

            migrations = descubrir_migraciones(directory)

        self.assertEqual([migration.version for migration in migrations], ["002", "003"])
        self.assertEqual([migration.nombre for migration in migrations], ["segunda", "tercera"])

    def test_ignores_legacy_subdirectory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            legacy = directory / "legacy"
            legacy.mkdir()
            (legacy / "001_obsoleta.sql").write_text("SELECT 1;", encoding="utf-8")
            (directory / "002_vigente.sql").write_text("SELECT 2;", encoding="utf-8")

            migrations = descubrir_migraciones(directory)

        self.assertEqual([migration.version for migration in migrations], ["002"])

    def test_rejects_invalid_file_names(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            (directory / "cambio_manual.sql").write_text("SELECT 1;", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "Nombre de migración inválido"):
                descubrir_migraciones(directory)

    def test_checksum_changes_with_content(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            path = directory / "002_vigente.sql"
            path.write_text("SELECT 1;", encoding="utf-8")
            first = descubrir_migraciones(directory)[0].checksum
            path.write_text("SELECT 2;", encoding="utf-8")
            second = descubrir_migraciones(directory)[0].checksum

        self.assertNotEqual(first, second)

    def test_study_plan_migration_uses_the_current_relationship(self):
        backend_root = Path(__file__).resolve().parents[1]
        migration = (
            backend_root / "migrations" / "004_crear_planes_estudio.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("CREATE TABLE IF NOT EXISTS academ.carrera", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS academ.plan_estudio", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS academ.plan_materia", migration)
        self.assertIn("UNIQUE (plan_estudio_id, materia_id)", migration)
        self.assertNotIn(
            "CREATE TABLE IF NOT EXISTS academ.materia_carrera",
            migration,
        )

    def test_student_migration_preserves_identifiers_under_current_name(self):
        backend_root = Path(__file__).resolve().parents[1]
        migration = (
            backend_root / "migrations" / "005_alinear_alumnos.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("RENAME COLUMN matricula TO no_control", migration)
        self.assertIn("ADD COLUMN IF NOT EXISTS plan_estudio_id", migration)
        self.assertIn("ADD COLUMN IF NOT EXISTS semestre_actual", migration)
        self.assertNotIn("DROP COLUMN matricula", migration)
        self.assertNotIn("ALTER COLUMN no_control TYPE", migration)

    def test_period_migration_preserves_legacy_state_meaning(self):
        backend_root = Path(__file__).resolve().parents[1]
        migration = (
            backend_root / "migrations" / "006_alinear_periodos.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("CASE WHEN activo THEN 'activo' ELSE 'cerrado' END", migration)
        self.assertIn("DROP COLUMN IF EXISTS activo", migration)
        self.assertIn("CHECK (estado IN ('proximo', 'activo', 'cerrado'))", migration)
        self.assertIn("tg_periodo_updated_at", migration)

    def test_supported_period_queries_do_not_use_legacy_active_flag(self):
        backend_root = Path(__file__).resolve().parents[1]
        sources = (
            backend_root / "app" / "routers" / "docentes.py",
            backend_root / "app" / "routers" / "periodos.py",
            backend_root / "app" / "routers" / "reportes.py",
        )

        for source in sources:
            content = source.read_text(encoding="utf-8")
            self.assertNotIn("p.activo", content, source)
            self.assertNotIn("periodo_academico WHERE activo", content, source)

    def test_group_migration_only_maps_unambiguous_study_plan_membership(self):
        backend_root = Path(__file__).resolve().parents[1]
        migration = (
            backend_root / "migrations" / "007_alinear_grupos.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("HAVING COUNT(*) = 1", migration)
        self.assertIn("grupos_sin_plan", migration)
        self.assertIn("ALTER COLUMN plan_materia_id SET NOT NULL", migration)
        self.assertNotIn("DROP COLUMN materia_id", migration)

    def test_supported_backend_does_not_join_groups_by_legacy_subject_id(self):
        backend_root = Path(__file__).resolve().parents[1]
        for source in (backend_root / "app").rglob("*.py"):
            content = source.read_text(encoding="utf-8")
            self.assertNotIn("g.materia_id", content, source)
            self.assertNotIn("a.matricula", content, source)

    def test_activity_migration_maps_legacy_enum_without_discarding_it(self):
        backend_root = Path(__file__).resolve().parents[1]
        migration = (
            backend_root / "migrations" / "008_alinear_materias_actividades.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("CREATE TABLE IF NOT EXISTS academ.tipo_actividad_catalogo", migration)
        self.assertIn("ADD COLUMN IF NOT EXISTS tipo_catalogo_id", migration)
        self.assertIn("ADD COLUMN IF NOT EXISTS fecha_apertura", migration)
        self.assertIn("ADD COLUMN IF NOT EXISTS fecha_cierre", migration)
        self.assertIn("CASE a.tipo::TEXT", migration)
        self.assertIn("WHEN 'PRACTICA_LAB' THEN 'Práctica'", migration)
        self.assertIn("ALTER COLUMN tipo DROP NOT NULL", migration)
        self.assertNotIn("DROP COLUMN tipo", migration)

    def test_supported_activity_catalog_query_does_not_depend_on_legacy_enum(self):
        backend_root = Path(__file__).resolve().parents[1]
        dashboard = (
            backend_root / "app" / "routers" / "dashboard.py"
        ).read_text(encoding="utf-8")

        self.assertIn("FROM academ.tipo_actividad_catalogo", dashboard)
        self.assertNotIn("FROM pg_enum", dashboard)
        self.assertNotIn("t.typname = 'tipo_actividad'", dashboard)

    def test_current_bootstrap_uses_activity_catalog_instead_of_legacy_enum(self):
        project_root = Path(__file__).resolve().parents[2]
        bootstrap = (project_root / "bd" / "database.sql").read_text(encoding="utf-8")

        self.assertIn("CREATE TABLE tipo_actividad_catalogo", bootstrap)
        self.assertIn("tipo_catalogo_id INT", bootstrap)
        self.assertNotIn("CREATE TYPE academ.tipo_actividad", bootstrap)
        self.assertNotIn("tipo           academ.tipo_actividad", bootstrap)

    def test_core_routines_migration_preserves_current_control_sequence(self):
        backend_root = Path(__file__).resolve().parents[1]
        migration = (
            backend_root / "migrations" / "009_establecer_rutinas_nucleo.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("CREATE TABLE IF NOT EXISTS academ.control_secuencial", migration)
        self.assertIn("WHERE no_control ~ '^[0-9]{8}$'", migration)
        self.assertIn("GREATEST(", migration)
        self.assertIn("RIGHT(p_anio::TEXT, 2)", migration)
        self.assertIn("ultimo_valor < 9999", migration)
        self.assertNotIn("LPAD(p_anio::TEXT, 2", migration)

    def test_period_activation_is_serialized_and_uniquely_constrained(self):
        backend_root = Path(__file__).resolve().parents[1]
        migration = (
            backend_root / "migrations" / "009_establecer_rutinas_nucleo.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("CREATE UNIQUE INDEX IF NOT EXISTS uq_periodo_unico_activo", migration)
        self.assertIn("pg_advisory_xact_lock", migration)
        self.assertIn("FOR UPDATE", migration)
        self.assertIn("jsonb_build_object('estado', v_estado_objetivo)", migration)
        self.assertIn("IF NOT FOUND THEN", migration)

    def test_activity_publication_preserves_existing_student_visibility(self):
        backend_root = Path(__file__).resolve().parents[1]
        migration = (
            backend_root / "migrations" / "010_publicar_actividades.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("ADD COLUMN IF NOT EXISTS publicada BOOLEAN", migration)
        self.assertIn("SET publicada = TRUE", migration)
        self.assertIn("WHERE publicada IS NULL", migration)
        self.assertIn("ALTER COLUMN publicada SET DEFAULT FALSE", migration)
        self.assertIn("AND a.publicada = TRUE", migration)
        self.assertIn("c.nombre AS tipo_nombre", migration)

    def test_supported_student_activity_flow_uses_current_type_name(self):
        project_root = Path(__file__).resolve().parents[2]
        backend = (
            project_root / "backend" / "app" / "routers" / "actividades.py"
        ).read_text(encoding="utf-8")
        frontend = (
            project_root / "frontend" / "src" / "pages" / "MisGrupoDetalle.jsx"
        ).read_text(encoding="utf-8")

        self.assertIn("tipo_nombre", backend)
        self.assertIn("tipo_nombre", frontend)
        self.assertNotIn("tipo_actividad,", backend)
        self.assertNotIn(".tipo_actividad", frontend)


if __name__ == "__main__":
    unittest.main()
