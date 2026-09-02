import unittest

from app.main import app


class ApplicationBootstrapTests(unittest.TestCase):
    def test_critical_routes_are_registered(self):
        registered_paths = set(app.openapi()["paths"])

        critical_paths = {
            "/auth/login",
            "/grupos/{grupo_id}/resultados",
            "/actividades/{actividad_id}/calificaciones/bulk",
        }

        self.assertTrue(critical_paths.issubset(registered_paths))

    def test_application_metadata_is_available(self):
        self.assertEqual(app.version, "1.0.0")
        self.assertTrue(app.title)


if __name__ == "__main__":
    unittest.main()
