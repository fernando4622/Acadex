import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class GroupRouterAuthorizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.router = (
            BACKEND_ROOT / "app" / "routers" / "grupos.py"
        ).read_text(encoding="utf-8")

    def test_sensitive_group_routes_use_current_database_ownership(self):
        self.assertGreaterEqual(
            self.router.count("await assert_can_manage_group(conn, user, grupo_id)"),
            3,
        )
        self.assertNotIn("assert_docente_en_grupo", self.router)

    def test_group_lifecycle_uses_the_policy_teacher_for_audit(self):
        self.assertIn(
            "docente_id = await assert_can_manage_group(conn, user, grupo_id)",
            self.router,
        )


if __name__ == "__main__":
    unittest.main()
