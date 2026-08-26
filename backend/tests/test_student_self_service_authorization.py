import unittest
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException

from app.auth.authorization import assert_can_read_student_record


BACKEND_ROOT = Path(__file__).resolve().parents[1]
STUDENT_ID = UUID("00000000-0000-0000-0000-000000000040")
OTHER_STUDENT_ID = UUID("00000000-0000-0000-0000-000000000041")


def user(role, entity_id=None):
    return {
        "roles": [role],
        "id_entidad": str(entity_id) if entity_id is not None else None,
    }


class StudentRecordPolicyTests(unittest.TestCase):
    def test_administrator_can_read_student_record(self):
        assert_can_read_student_record(user("ADMIN"), STUDENT_ID)

    def test_student_can_read_own_record(self):
        assert_can_read_student_record(
            user("ALUMNO", STUDENT_ID),
            STUDENT_ID,
        )

    def test_student_cannot_read_another_record(self):
        with self.assertRaises(HTTPException) as raised:
            assert_can_read_student_record(
                user("ALUMNO", OTHER_STUDENT_ID),
                STUDENT_ID,
            )

        self.assertEqual(raised.exception.status_code, 403)

    def test_non_student_with_matching_identifier_is_denied(self):
        with self.assertRaises(HTTPException) as raised:
            assert_can_read_student_record(
                user("DOCENTE", STUDENT_ID),
                STUDENT_ID,
            )

        self.assertEqual(raised.exception.status_code, 403)


class StudentSelfServiceRouterPolicyTests(unittest.TestCase):
    def test_student_routes_delegate_to_resource_policies(self):
        activities = (
            BACKEND_ROOT / "app" / "routers" / "actividades.py"
        ).read_text(encoding="utf-8")
        reports = (
            BACKEND_ROOT / "app" / "routers" / "reportes.py"
        ).read_text(encoding="utf-8")

        self.assertIn(
            "await assert_can_read_enrollment(conn, user, inscripcion_id)",
            activities,
        )
        self.assertIn(
            "assert_can_read_student_record(user, alumno_id)",
            reports,
        )
        self.assertNotIn("if not is_admin(user)", reports)


if __name__ == "__main__":
    unittest.main()
