import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
FRONTEND_ROOT = PROJECT_ROOT / "frontend" / "src"


class ReportIdentifierContractTests(unittest.TestCase):
    def test_report_endpoints_expose_no_control(self):
        sources = (
            BACKEND_ROOT / "app" / "routers" / "reportes.py",
            BACKEND_ROOT / "app" / "routers" / "dashboard.py",
            BACKEND_ROOT / "app" / "routers" / "analytics.py",
        )

        for source in sources:
            content = source.read_text(encoding="utf-8")
            self.assertIn("no_control", content, source)
            self.assertNotIn("AS matricula", content, source)

    def test_report_screens_consume_no_control(self):
        sources = (
            FRONTEND_ROOT / "pages" / "MapaRiesgo.jsx",
            FRONTEND_ROOT / "pages" / "Reportes.jsx",
            FRONTEND_ROOT / "pages" / "AnalisisComparativo.jsx",
            FRONTEND_ROOT / "pages" / "ReportesAcademicos.jsx",
        )

        for source in sources:
            content = source.read_text(encoding="utf-8")
            self.assertIn("no_control", content, source)
            self.assertNotIn("matricula", content, source)
            self.assertNotIn("num_control", content, source)

    def test_export_generator_uses_only_current_identifier(self):
        generator = (
            FRONTEND_ROOT / "utils" / "reportGenerator.js"
        ).read_text(encoding="utf-8")

        self.assertIn("d.no_control", generator)
        self.assertNotIn("d.matricula", generator)

    def test_login_contract_documents_current_identifier(self):
        sources = (
            BACKEND_ROOT / "app" / "auth" / "router.py",
            BACKEND_ROOT / "app" / "auth" / "schemas.py",
        )

        for source in sources:
            content = source.read_text(encoding="utf-8")
            self.assertIn("no_control", content, source)
            self.assertNotIn("num_control para alumnos", content, source)


if __name__ == "__main__":
    unittest.main()
