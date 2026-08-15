import unittest
from pathlib import Path

from scripts.verificar_instalacion_limpia import (
    citar_identificador,
    generar_nombre_base_temporal,
    reemplazar_nombre_base,
)


class CleanInstallSafetyTests(unittest.TestCase):
    def test_generated_database_name_is_accepted_for_cleanup(self):
        nombre = generar_nombre_base_temporal()

        self.assertEqual(citar_identificador(nombre), f'"{nombre}"')

    def test_cleanup_rejects_non_temporary_database_names(self):
        for nombre in ("acadex", "postgres", "acadex_validacion_manual", ""):
            with self.subTest(nombre=nombre):
                with self.assertRaises(ValueError):
                    citar_identificador(nombre)

    def test_replaces_only_the_database_path(self):
        original = "postgresql://usuario:secreto@localhost:5432/acadex?sslmode=disable"

        resultado = reemplazar_nombre_base(original, "acadex_validacion_123456789abc")

        self.assertEqual(
            resultado,
            "postgresql://usuario:secreto@localhost:5432/"
            "acadex_validacion_123456789abc?sslmode=disable",
        )

    def test_rejects_non_postgresql_urls(self):
        with self.assertRaises(ValueError):
            reemplazar_nombre_base("sqlite:///acadex.db", "acadex_validacion_123456789abc")

    def test_student_activity_view_uses_result_timestamp_contract(self):
        project_root = Path(__file__).resolve().parents[2]
        bootstrap = (project_root / "bd" / "database.sql").read_text(encoding="utf-8")

        self.assertIn("ra.fecha_registro", bootstrap)
        self.assertIn("ra.fecha_modificacion", bootstrap)
        self.assertNotIn("ra.created_at", bootstrap)
        self.assertNotIn("ra.updated_at", bootstrap)

    def test_demo_flow_uses_a_disabled_actor_with_random_credentials(self):
        project_root = Path(__file__).resolve().parents[2]
        bootstrap = (project_root / "bd" / "database.sql").read_text(encoding="utf-8")

        self.assertIn("'docente.demo@acadex.invalid'", bootstrap)
        self.assertIn("gen_random_bytes(32)", bootstrap)
        self.assertIn("v_usuario_docente_id::TEXT", bootstrap)
        self.assertNotIn("docente.demo@acadex.invalid', '$2", bootstrap)


if __name__ == "__main__":
    unittest.main()
