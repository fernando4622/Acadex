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


if __name__ == "__main__":
    unittest.main()
