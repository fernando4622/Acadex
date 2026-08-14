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


if __name__ == "__main__":
    unittest.main()
