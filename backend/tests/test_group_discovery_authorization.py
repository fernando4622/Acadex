import unittest
from pathlib import Path

from fastapi import HTTPException

from app.auth.authorization import get_group_list_scope


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class GroupListScopeTests(unittest.TestCase):
    def test_administrator_receives_global_scope(self):
        self.assertEqual(get_group_list_scope({"roles": ["ADMIN"]}), "ADMIN")

    def test_teacher_receives_teacher_scope(self):
        self.assertEqual(get_group_list_scope({"roles": ["DOCENTE"]}), "DOCENTE")

    def test_student_receives_student_scope(self):
        self.assertEqual(get_group_list_scope({"roles": ["ALUMNO"]}), "ALUMNO")

    def test_administrator_precedes_other_roles(self):
        self.assertEqual(
            get_group_list_scope({"roles": ["ALUMNO", "ADMIN"]}),
            "ADMIN",
        )

    def test_unknown_role_is_denied(self):
        with self.assertRaises(HTTPException) as raised:
            get_group_list_scope({"roles": ["INVITADO"]})

        self.assertEqual(raised.exception.status_code, 403)


class GroupDiscoveryRouterPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.router = (
            BACKEND_ROOT / "app" / "routers" / "grupos.py"
        ).read_text(encoding="utf-8")

    def test_group_list_uses_explicit_policy_scope(self):
        self.assertIn("scope = get_group_list_scope(user)", self.router)
        self.assertIn('if scope == "ADMIN":', self.router)
        self.assertIn('elif scope == "DOCENTE":', self.router)

    def test_group_detail_checks_current_resource_access(self):
        self.assertIn(
            "await assert_can_read_group_content(conn, user, grupo_id)",
            self.router,
        )


if __name__ == "__main__":
    unittest.main()
