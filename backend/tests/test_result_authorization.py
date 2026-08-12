import unittest
from uuid import UUID

from fastapi import HTTPException

from app.auth.authorization import (
    assert_can_read_enrollment_unit,
    assert_can_read_group_results,
)


GROUP_ID = UUID("00000000-0000-0000-0000-000000000010")
ENROLLMENT_ID = UUID("00000000-0000-0000-0000-000000000020")
TEACHER_ID = UUID("00000000-0000-0000-0000-000000000030")
OTHER_TEACHER_ID = UUID("00000000-0000-0000-0000-000000000031")
STUDENT_ID = UUID("00000000-0000-0000-0000-000000000040")
OTHER_STUDENT_ID = UUID("00000000-0000-0000-0000-000000000041")
UNIT_ID = 7


class FakeConnection:
    def __init__(self, row):
        self.row = row
        self.calls = []

    async def fetchrow(self, query, *args):
        self.calls.append((query, args))
        return self.row


def user(*roles, entity_id=None):
    return {
        "roles": list(roles),
        "id_entidad": str(entity_id) if entity_id is not None else None,
    }


class GroupResultAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_admin_can_read_existing_group(self):
        conn = FakeConnection({"docente_id": TEACHER_ID})

        await assert_can_read_group_results(conn, user("ADMIN"), GROUP_ID)

    async def test_current_teacher_can_read_group(self):
        conn = FakeConnection({"docente_id": TEACHER_ID})

        await assert_can_read_group_results(
            conn, user("DOCENTE", entity_id=TEACHER_ID), GROUP_ID
        )

    async def test_other_teacher_cannot_read_group(self):
        conn = FakeConnection({"docente_id": TEACHER_ID})

        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_group_results(
                conn, user("DOCENTE", entity_id=OTHER_TEACHER_ID), GROUP_ID
            )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_student_cannot_read_group_roster(self):
        conn = FakeConnection({"docente_id": TEACHER_ID})

        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_group_results(
                conn, user("ALUMNO", entity_id=STUDENT_ID), GROUP_ID
            )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_missing_group_returns_not_found_for_admin(self):
        conn = FakeConnection(None)

        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_group_results(conn, user("ADMIN"), GROUP_ID)

        self.assertEqual(raised.exception.status_code, 404)


class EnrollmentUnitAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.resource = {
            "docente_id": TEACHER_ID,
            "alumno_id": STUDENT_ID,
        }

    async def test_admin_can_read_existing_result(self):
        conn = FakeConnection(self.resource)

        await assert_can_read_enrollment_unit(
            conn,
            user("ADMIN"),
            ENROLLMENT_ID,
            UNIT_ID,
            allow_student_owner=True,
        )

    async def test_current_teacher_can_read_result(self):
        conn = FakeConnection(self.resource)

        await assert_can_read_enrollment_unit(
            conn,
            user("DOCENTE", entity_id=TEACHER_ID),
            ENROLLMENT_ID,
            UNIT_ID,
            allow_student_owner=False,
        )

    async def test_other_teacher_cannot_read_result(self):
        conn = FakeConnection(self.resource)

        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_enrollment_unit(
                conn,
                user("DOCENTE", entity_id=OTHER_TEACHER_ID),
                ENROLLMENT_ID,
                UNIT_ID,
                allow_student_owner=False,
            )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_student_can_read_own_result(self):
        conn = FakeConnection(self.resource)

        await assert_can_read_enrollment_unit(
            conn,
            user("ALUMNO", entity_id=STUDENT_ID),
            ENROLLMENT_ID,
            UNIT_ID,
            allow_student_owner=True,
        )

    async def test_student_cannot_read_another_students_result(self):
        conn = FakeConnection(self.resource)

        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_enrollment_unit(
                conn,
                user("ALUMNO", entity_id=OTHER_STUDENT_ID),
                ENROLLMENT_ID,
                UNIT_ID,
                allow_student_owner=True,
            )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_student_is_denied_when_endpoint_is_teacher_only(self):
        conn = FakeConnection(self.resource)

        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_enrollment_unit(
                conn,
                user("ALUMNO", entity_id=STUDENT_ID),
                ENROLLMENT_ID,
                UNIT_ID,
                allow_student_owner=False,
            )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_mismatched_or_missing_pair_returns_not_found(self):
        conn = FakeConnection(None)

        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_enrollment_unit(
                conn,
                user("ADMIN"),
                ENROLLMENT_ID,
                UNIT_ID,
                allow_student_owner=True,
            )

        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
