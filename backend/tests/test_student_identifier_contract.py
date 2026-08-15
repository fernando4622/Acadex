import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
FRONTEND_ROOT = PROJECT_ROOT / "frontend" / "src"


class StudentIdentifierContractTests(unittest.TestCase):
    def test_academic_routers_expose_no_control(self):
        sources = (
            BACKEND_ROOT / "app" / "routers" / "calificaciones.py",
            BACKEND_ROOT / "app" / "routers" / "grupos.py",
            BACKEND_ROOT / "app" / "routers" / "resultados.py",
        )

        for source in sources:
            content = source.read_text(encoding="utf-8")
            self.assertIn("no_control", content, source)
            self.assertNotIn("AS matricula", content, source)

    def test_enrollment_contract_uses_current_identifier_and_relationship(self):
        router = (
            BACKEND_ROOT / "app" / "routers" / "inscripciones.py"
        ).read_text(encoding="utf-8")
        schema = (
            BACKEND_ROOT / "app" / "schemas" / "inscripcion.py"
        ).read_text(encoding="utf-8")

        self.assertIn("a.no_control AS alumno_no_control", router)
        self.assertIn("alumno_no_control", schema)
        self.assertNotIn("alumno_matricula", router + schema)
        self.assertNotIn(
            "INSERT INTO academ.inscripcion (alumno_id,grupo_id,periodo_id",
            router,
        )
        self.assertNotIn("i.periodo_id", router)

    def test_primary_academic_screens_consume_no_control(self):
        sources = (
            FRONTEND_ROOT / "pages" / "Grupos.jsx",
            FRONTEND_ROOT / "pages" / "GrupoDetalle.jsx",
            FRONTEND_ROOT / "pages" / "Resultados.jsx",
            FRONTEND_ROOT / "pages" / "Alumnos.jsx",
        )

        for source in sources:
            content = source.read_text(encoding="utf-8")
            self.assertIn("no_control", content, source)
            self.assertNotIn(".matricula", content, source)
            self.assertNotIn("alumno_matricula", content, source)

    def test_report_generator_prefers_current_identifier(self):
        generator = (
            FRONTEND_ROOT / "utils" / "reportGenerator.js"
        ).read_text(encoding="utf-8")

        self.assertIn("d.no_control ?? d.matricula", generator)


if __name__ == "__main__":
    unittest.main()
