import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class StudentDirectoryAuthorizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.router = (
            BACKEND_ROOT / "app" / "routers" / "alumnos.py"
        ).read_text(encoding="utf-8")

    def _endpoint_section(self, start: str, end: str) -> str:
        return self.router.split(start, 1)[1].split(end, 1)[0]

    def test_student_directory_requires_administrator(self):
        section = self._endpoint_section(
            "async def listar_alumnos(",
            "async def crear_alumno(",
        )
        self.assertIn("Depends(require_admin)", section)
        self.assertNotIn("Depends(require_docente_o_admin)", section)

    def test_student_profile_requires_administrator(self):
        section = self._endpoint_section(
            "async def obtener_alumno(",
            "async def actualizar_alumno(",
        )
        self.assertIn("Depends(require_admin)", section)
        self.assertNotIn("Depends(require_docente_o_admin)", section)

    def test_student_analytics_requires_administrator(self):
        section = self._endpoint_section(
            "async def obtener_analytics_alumno(",
            "async def obtener_kardex_alumno(",
        )
        self.assertIn("Depends(require_admin)", section)
        self.assertNotIn("Depends(require_docente_o_admin)", section)


if __name__ == "__main__":
    unittest.main()
