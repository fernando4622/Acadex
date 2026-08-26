import unittest
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException

from app.auth.authorization import assert_can_read_enrollment


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ENROLLMENT_ID = UUID("00000000-0000-0000-0000-000000000020")
TEACHER_ID = UUID("00000000-0000-0000-0000-000000000030")
OTHER_TEACHER_ID = UUID("00000000-0000-0000-0000-000000000031")
STUDENT_ID = UUID("00000000-0000-0000-0000-000000000040")
OTHER_STUDENT_ID = UUID("00000000-0000-0000-0000-000000000041")


def user(role, entity_id=None):
    return {
        "roles": [role],
        "id_entidad": str(entity_id) if entity_id is not None else None,
    }


class FakeConnection:
    def __init__(self, resource):
        self.resource = resource

    async def fetchrow(self, query, *args):
        return self.resource


class EnrollmentDetailPolicyTests(unittest.IsolatedAsyncioTestCase):
    def connection(self, *, teacher_id=TEACHER_ID):
        return FakeConnection(
            {"alumno_id": STUDENT_ID, "docente_id": teacher_id}
        )

    async def test_administrator_can_read_enrollment(self):
        await assert_can_read_enrollment(
            self.connection(),
            user("ADMIN"),
            ENROLLMENT_ID,
        )

    async def test_current_teacher_can_read_enrollment(self):
        await assert_can_read_enrollment(
            self.connection(),
            user("DOCENTE", TEACHER_ID),
            ENROLLMENT_ID,
        )

    async def test_reassigned_teacher_is_denied(self):
        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_enrollment(
                self.connection(teacher_id=OTHER_TEACHER_ID),
                user("DOCENTE", TEACHER_ID),
                ENROLLMENT_ID,
            )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_enrollment_owner_can_read_enrollment(self):
        await assert_can_read_enrollment(
            self.connection(),
            user("ALUMNO", STUDENT_ID),
            ENROLLMENT_ID,
        )

    async def test_other_student_is_denied(self):
        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_enrollment(
                self.connection(),
                user("ALUMNO", OTHER_STUDENT_ID),
                ENROLLMENT_ID,
            )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_missing_enrollment_is_not_found(self):
        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_enrollment(
                FakeConnection(None),
                user("ADMIN"),
                ENROLLMENT_ID,
            )

        self.assertEqual(raised.exception.status_code, 404)


class EnrollmentDetailRouterPolicyTests(unittest.TestCase):
    def test_router_delegates_enrollment_access_to_policy(self):
        router = (
            BACKEND_ROOT / "app" / "routers" / "inscripciones.py"
        ).read_text(encoding="utf-8")

        self.assertIn(
            "await assert_can_read_enrollment(conn, user, inscripcion_id)",
            router,
        )
        self.assertNotIn("tiene_permiso = await conn.fetchval", router)


if __name__ == "__main__":
    unittest.main()
