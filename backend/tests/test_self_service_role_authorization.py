import unittest
from pathlib import Path

from fastapi import HTTPException

from app.middleware.auth import require_alumno, require_docente


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class SelfServiceRoleDependencyTests(unittest.TestCase):
    def test_teacher_dependency_accepts_teacher(self):
        user = {"roles": ["DOCENTE"]}
        self.assertIs(require_docente(user), user)

    def test_teacher_dependency_rejects_administrator_without_teacher_role(self):
        with self.assertRaises(HTTPException) as raised:
            require_docente({"roles": ["ADMIN"]})

        self.assertEqual(raised.exception.status_code, 403)

    def test_student_dependency_accepts_student(self):
        user = {"roles": ["ALUMNO"]}
        self.assertIs(require_alumno(user), user)

    def test_student_dependency_rejects_teacher(self):
        with self.assertRaises(HTTPException) as raised:
            require_alumno({"roles": ["DOCENTE"]})

        self.assertEqual(raised.exception.status_code, 403)

    def test_multi_role_user_can_access_each_owned_role(self):
        user = {"roles": ["DOCENTE", "ALUMNO"]}
        self.assertIs(require_docente(user), user)
        self.assertIs(require_alumno(user), user)


class SelfServiceRouterDependencyTests(unittest.TestCase):
    def _source(self, relative_path: str) -> str:
        return (BACKEND_ROOT / relative_path).read_text(encoding="utf-8")

    def test_student_endpoints_require_student_role(self):
        students = self._source("app/routers/alumnos.py")
        enrollments = self._source("app/routers/inscripciones.py")
        dashboard = self._source("app/routers/dashboard.py")

        self.assertIn("user: dict = Depends(require_alumno)", students)
        self.assertIn("user: dict = Depends(require_alumno)", enrollments)
        self.assertIn("user: dict = Depends(require_alumno)", dashboard)

    def test_teacher_endpoints_require_teacher_role(self):
        teachers = self._source("app/routers/docentes.py")
        dashboard = self._source("app/routers/dashboard.py")

        self.assertIn("user: dict = Depends(require_docente)", teachers)
        self.assertIn("user: dict = Depends(require_docente)", dashboard)


if __name__ == "__main__":
    unittest.main()
