import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class GroupReportingAuthorizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dashboard = (
            BACKEND_ROOT / "app" / "routers" / "dashboard.py"
        ).read_text(encoding="utf-8")
        cls.enrollments = (
            BACKEND_ROOT / "app" / "routers" / "inscripciones.py"
        ).read_text(encoding="utf-8")
        cls.auth_middleware = (
            BACKEND_ROOT / "app" / "middleware" / "auth.py"
        ).read_text(encoding="utf-8")

    def test_detailed_report_uses_current_database_ownership(self):
        self.assertIn(
            "await assert_can_manage_group(conn, user, grupo_id)",
            self.dashboard,
        )
        self.assertNotIn("assert_docente_en_grupo", self.dashboard)

    def test_group_roster_uses_current_database_ownership(self):
        self.assertIn(
            "await assert_can_manage_group(conn, user, grupo_id)",
            self.enrollments,
        )
        self.assertNotIn("assert_docente_en_grupo", self.enrollments)

    def test_student_dashboard_hides_unpublished_activities(self):
        self.assertIn("AND a.publicada = TRUE", self.dashboard)

    def test_legacy_token_group_policy_is_removed(self):
        self.assertNotIn("assert_docente_en_grupo", self.auth_middleware)
        self.assertNotIn('user.get("grupos"', self.auth_middleware)


if __name__ == "__main__":
    unittest.main()
