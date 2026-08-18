import unittest
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException

from app.auth.authorization import assert_can_manage_activity


BACKEND_ROOT = Path(__file__).resolve().parents[1]
GROUP_ID = UUID("00000000-0000-0000-0000-000000000010")
TEACHER_ID = UUID("00000000-0000-0000-0000-000000000030")
OTHER_TEACHER_ID = UUID("00000000-0000-0000-0000-000000000031")


def user(role, entity_id=None):
    return {
        "roles": [role],
        "id_entidad": str(entity_id) if entity_id is not None else None,
    }


class FakeConnection:
    def __init__(self, *, group_id=GROUP_ID, teacher_id=TEACHER_ID):
        self.group_id = group_id
        self.teacher_id = teacher_id

    async def fetchval(self, query, *args):
        return self.group_id

    async def fetchrow(self, query, *args):
        return {"docente_id": self.teacher_id}


class ActivityGradePolicyTests(unittest.IsolatedAsyncioTestCase):
    async def test_current_teacher_can_manage_activity_grades(self):
        group_id = await assert_can_manage_activity(
            FakeConnection(),
            user("DOCENTE", TEACHER_ID),
            5,
        )

        self.assertEqual(group_id, GROUP_ID)

    async def test_reassigned_teacher_is_denied(self):
        with self.assertRaises(HTTPException) as raised:
            await assert_can_manage_activity(
                FakeConnection(teacher_id=OTHER_TEACHER_ID),
                user("DOCENTE", TEACHER_ID),
                5,
            )

        self.assertEqual(raised.exception.status_code, 403)

    async def test_missing_activity_is_not_found(self):
        with self.assertRaises(HTTPException) as raised:
            await assert_can_manage_activity(
                FakeConnection(group_id=None),
                user("ADMIN"),
                5,
            )

        self.assertEqual(raised.exception.status_code, 404)


class GradeRouterPolicyTests(unittest.TestCase):
    def test_grade_routes_delegate_activity_ownership(self):
        grades = (
            BACKEND_ROOT / "app" / "routers" / "calificaciones.py"
        ).read_text(encoding="utf-8")

        self.assertIn(
            "await assert_can_manage_activity(conn, user, actividad_id)",
            grades,
        )
        self.assertEqual(grades.count("await authorize_activity_mutation("), 2)
        self.assertNotIn("_get_grupo_de_actividad", grades)

    def test_pending_capture_route_has_one_canonical_owner(self):
        grades = (
            BACKEND_ROOT / "app" / "routers" / "calificaciones.py"
        ).read_text(encoding="utf-8")
        units = (
            BACKEND_ROOT / "app" / "routers" / "unidades.py"
        ).read_text(encoding="utf-8")

        route = '@router.get("/unidades/{unidad_id}/captura-pendiente")'
        self.assertNotIn(route, grades)
        self.assertEqual(units.count(route), 1)


if __name__ == "__main__":
    unittest.main()
