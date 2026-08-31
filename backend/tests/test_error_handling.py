import unittest
from pathlib import Path

from app.errors import handle_pg_error


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class FakePostgresError(Exception):
    def __init__(self, sqlstate, message):
        super().__init__(message)
        self.sqlstate = sqlstate


class PostgreSQLErrorHandlingTests(unittest.TestCase):
    def test_mapped_business_error_preserves_public_message(self):
        error = handle_pg_error(
            FakePostgresError("P0005", "La calificación está fuera de rango.")
        )

        self.assertEqual(error.status_code, 422)
        self.assertEqual(error.detail["codigo"], "CALIFICACION_FUERA_DE_RANGO")
        self.assertEqual(
            error.detail["mensaje"],
            "La calificación está fuera de rango.",
        )

    def test_unmapped_database_error_returns_stable_public_message(self):
        secret = "connection failed password=super-secret"

        with self.assertLogs("app.errors", level="ERROR") as captured:
            error = handle_pg_error(FakePostgresError("XX000", secret))

        self.assertEqual(error.status_code, 500)
        self.assertEqual(error.detail["codigo"], "ERROR_BASE_DE_DATOS")
        self.assertEqual(
            error.detail["mensaje"],
            "No se pudo completar la operación solicitada.",
        )
        self.assertNotIn(secret, str(error.detail))
        self.assertNotIn(secret, " ".join(captured.output))
        self.assertIn("sqlstate=XX000", " ".join(captured.output))


class ResultErrorHandlingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.router = (
            BACKEND_ROOT / "app" / "routers" / "resultados.py"
        ).read_text(encoding="utf-8")

    def test_result_routes_do_not_print_debug_output(self):
        self.assertNotIn("print(", self.router)
        self.assertNotIn("traceback", self.router)

    def test_result_routes_do_not_return_internal_exception_messages(self):
        self.assertNotIn('"mensaje": str(', self.router)
        self.assertIn(
            '"mensaje": "No se pudo calcular el resultado de la unidad."',
            self.router,
        )

    def test_result_error_log_uses_safe_context(self):
        self.assertIn("Dynamic unit result failed", self.router)
        self.assertIn("type(exc).__name__", self.router)
        self.assertNotIn("logger.exception", self.router)


class DashboardAndCatalogErrorHandlingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        routers = BACKEND_ROOT / "app" / "routers"
        cls.dashboard = (routers / "dashboard.py").read_text(encoding="utf-8")
        cls.catalogs = (routers / "catalogos.py").read_text(encoding="utf-8")

    def test_dashboard_returns_stable_internal_error(self):
        self.assertNotIn("print(", self.dashboard)
        self.assertNotIn('return {"error": str(', self.dashboard)
        self.assertIn(
            '"mensaje": "No se pudo cargar el dashboard del alumno."',
            self.dashboard,
        )

    def test_dashboard_log_does_not_include_exception_message(self):
        self.assertIn("Student dashboard failed", self.dashboard)
        self.assertIn("type(exc).__name__", self.dashboard)
        self.assertNotIn("logger.exception", self.dashboard)

    def test_catalog_routes_do_not_expose_debug_output_or_tracebacks(self):
        self.assertNotIn("print(", self.catalogs)
        self.assertNotIn("traceback", self.catalogs)
        self.assertNotIn('"mensaje": str(', self.catalogs)

    def test_catalog_errors_use_stable_public_messages(self):
        expected_messages = (
            "No se pudo crear la materia.",
            "No se pudo actualizar la materia.",
            "No se pudo vincular la materia al plan de estudio.",
            "No se pudo crear el prerrequisito.",
        )

        for message in expected_messages:
            with self.subTest(message=message):
                self.assertIn(message, self.catalogs)

    def test_catalog_logs_only_safe_error_context(self):
        self.assertIn("Create subject failed", self.catalogs)
        self.assertIn("Update subject failed", self.catalogs)
        self.assertIn("Link subject to study plan failed", self.catalogs)
        self.assertIn("Create prerequisite failed", self.catalogs)
        self.assertIn("type(exc).__name__", self.catalogs)
        self.assertNotIn("logger.exception", self.catalogs)


if __name__ == "__main__":
    unittest.main()
