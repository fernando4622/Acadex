import unittest
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException

from app.auth.authorization import assert_can_read_group_content


BACKEND_ROOT = Path(__file__).resolve().parents[1]
GROUP_ID = UUID("00000000-0000-0000-0000-000000000010")
TEACHER_ID = UUID("00000000-0000-0000-0000-000000000030")
OTHER_TEACHER_ID = UUID("00000000-0000-0000-0000-000000000031")
STUDENT_ID = UUID("00000000-0000-0000-0000-000000000040")


class FakeConnection:
    def __init__(self, *, enrolled=False, teacher_id=TEACHER_ID):
        self.enrolled = enrolled
        self.teacher_id = teacher_id

    async def fetchrow(self, query, *args):
        return {"docente_id": self.teacher_id}

    async def fetchval(self, query, *args):
        return self.enrolled


def user(role, entity_id):
    return {"roles": [role], "id_entidad": str(entity_id)}


class GroupContentPolicyTests(unittest.IsolatedAsyncioTestCase):
    async def test_current_teacher_can_read_group_content(self):
        await assert_can_read_group_content(
            FakeConnection(),
            user("DOCENTE", TEACHER_ID),
            GROUP_ID,
        )

    async def test_reassigned_teacher_is_denied(self):
        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_group_content(
                FakeConnection(teacher_id=OTHER_TEACHER_ID),
                user("DOCENTE", TEACHER_ID),
                GROUP_ID,
            )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_active_student_can_read_group_content(self):
        await assert_can_read_group_content(
            FakeConnection(enrolled=True),
            user("ALUMNO", STUDENT_ID),
            GROUP_ID,
        )

    async def test_student_without_active_enrollment_is_denied(self):
        with self.assertRaises(HTTPException) as raised:
            await assert_can_read_group_content(
                FakeConnection(enrolled=False),
                user("ALUMNO", STUDENT_ID),
                GROUP_ID,
            )

        self.assertEqual(raised.exception.status_code, 403)


class UnitActivityRouterPolicyTests(unittest.TestCase):
    def test_routers_do_not_use_token_group_snapshots(self):
        for relative_path in ("actividades.py", "unidades.py"):
            source = (
                BACKEND_ROOT / "app" / "routers" / relative_path
            ).read_text(encoding="utf-8")
            self.assertNotIn("assert_docente_en_grupo", source)
            self.assertIn("assert_can_manage_group", source)
            self.assertIn("assert_can_read_group_content", source)

    def test_student_activity_list_filters_unpublished_drafts(self):
        activities = (
            BACKEND_ROOT / "app" / "routers" / "actividades.py"
        ).read_text(encoding="utf-8")

        self.assertIn("AND (NOT $2::boolean OR a.publicada=TRUE)", activities)
        self.assertIn("is_alumno(user)", activities)


if __name__ == "__main__":
    unittest.main()
