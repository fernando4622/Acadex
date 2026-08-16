import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class CriticalQueryContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (
            BACKEND_ROOT / "scripts" / "verificar_consultas_criticas.py"
        ).read_text(encoding="utf-8")

    def test_verifier_covers_core_academic_read_paths(self):
        expected_paths = (
            "academ.inscripcion",
            "academ.resultado_actividad",
            "academ.v_resultados_finales",
            "academ.v_resultados_parciales",
            "academ.v_actividades_alumno",
            "academ.fn_calcular_resultado_materia",
        )

        for path in expected_paths:
            self.assertIn(path, self.source)

    def test_verifier_uses_current_schema_names(self):
        self.assertIn("no_control", self.source)
        self.assertIn("plan_materia_id", self.source)
        self.assertIn("tipo_nombre", self.source)
        self.assertNotIn("matricula", self.source)
        self.assertNotIn("g.materia_id", self.source)

    def test_verifier_runs_inside_a_read_only_transaction(self):
        self.assertIn("transaction(readonly=True)", self.source)


if __name__ == "__main__":
    unittest.main()
