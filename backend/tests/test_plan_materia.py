import unittest
from pathlib import Path

from app.helpers.plan_materia import resolver_grupo_desde_clave_materia


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class FakeConnection:
    def __init__(self, rows):
        self.rows = rows
        self.query = None
        self.args = None

    async def fetch(self, query, *args):
        self.query = query
        self.args = args
        return self.rows


class PlanMateriaResolutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_resolves_a_unique_plan_assignment(self):
        conn = FakeConnection(
            [{
                "materia_id": 12,
                "carrera_id": 3,
                "materia_clave": "1ISC1",
                "carrera_clave": "ISC",
            }]
        )

        result = await resolver_grupo_desde_clave_materia(conn, " 1isc1 ")

        self.assertEqual(
            result,
            {"materia_id": 12, "carrera_id": 3, "clave": "1ISC1"},
        )
        self.assertIn("academ.plan_materia", conn.query)
        self.assertIn("academ.plan_estudio", conn.query)
        self.assertEqual(conn.args, ("1ISC1",))

    async def test_requires_career_when_key_exists_in_multiple_careers(self):
        conn = FakeConnection(
            [
                {"materia_id": 12, "carrera_id": 3, "materia_clave": "MAT1", "carrera_clave": "ISC"},
                {"materia_id": 12, "carrera_id": 4, "materia_clave": "MAT1", "carrera_clave": "ICI"},
            ]
        )

        with self.assertRaisesRegex(ValueError, "varias carreras"):
            await resolver_grupo_desde_clave_materia(conn, "MAT1")

    async def test_selects_the_requested_career(self):
        conn = FakeConnection(
            [
                {"materia_id": 12, "carrera_id": 3, "materia_clave": "MAT1", "carrera_clave": "ISC"},
                {"materia_id": 12, "carrera_id": 4, "materia_clave": "MAT1", "carrera_clave": "ICI"},
            ]
        )

        result = await resolver_grupo_desde_clave_materia(conn, "MAT1", "ici")

        self.assertEqual(result["carrera_id"], 4)

    async def test_rejects_a_key_without_a_plan_assignment(self):
        conn = FakeConnection([])

        with self.assertRaisesRegex(ValueError, "Plan de Estudios"):
            await resolver_grupo_desde_clave_materia(conn, "SIN-PLAN")


class LegacyMateriaCarreraTests(unittest.TestCase):
    def test_supported_backend_does_not_reference_legacy_table(self):
        supported_sources = tuple((BACKEND_ROOT / "app").rglob("*.py"))

        for source in supported_sources:
            content = source.read_text(encoding="utf-8")
            self.assertNotIn("academ.materia_carrera", content, source)
            self.assertNotIn("helpers.materia_carrera", content, source)

    def test_materia_import_uses_plan_linking_as_a_separate_step(self):
        source = (
            BACKEND_ROOT / "app" / "routers" / "importacion.py"
        ).read_text(encoding="utf-8")

        self.assertNotIn("sync_materia_carreras", source)
        self.assertNotIn("resolver_celdas_carreras_materias_csv", source)


if __name__ == "__main__":
    unittest.main()
