import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent


class ImportSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.importer = (
            BACKEND_ROOT / "app" / "routers" / "importacion.py"
        ).read_text(encoding="utf-8")
        cls.bootstrap = (
            PROJECT_ROOT / "bd" / "database.sql"
        ).read_text(encoding="utf-8")

    def test_student_import_uses_integer_study_plan_identifiers(self):
        self.assertIn("plan_estudio_id = int(plan_id)", self.importer)
        self.assertIn(
            "SELECT id FROM academ.plan_estudio WHERE id=$1",
            self.importer,
        )
        self.assertNotIn("UUID(plan_id)", self.importer)

    def test_enrollment_import_does_not_duplicate_the_group_period(self):
        self.assertIn(
            "INSERT INTO academ.inscripcion (alumno_id, grupo_id)",
            self.importer,
        )
        self.assertNotIn(
            "INSERT INTO academ.inscripcion (alumno_id, grupo_id, periodo_id)",
            self.importer,
        )
        self.assertNotIn("periodo_id", self._inscripcion_table_columns())

    def test_student_import_responses_use_current_identifier(self):
        self.assertIn('fila=i, no_control=matricula', self.importer)
        self.assertIn('"no_control": matricula', self.importer)
        self.assertIn('fila.get("no_control")', self.importer)

    def _inscripcion_table_columns(self):
        start = self.bootstrap.index("CREATE TABLE inscripcion (")
        end = self.bootstrap.index(");", start)
        return self.bootstrap[start:end]


if __name__ == "__main__":
    unittest.main()
