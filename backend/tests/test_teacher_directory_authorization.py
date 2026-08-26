import unittest
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException

from app.auth.authorization import assert_can_read_teacher_record


BACKEND_ROOT = Path(__file__).resolve().parents[1]
TEACHER_ID = UUID("00000000-0000-0000-0000-000000000030")
OTHER_TEACHER_ID = UUID("00000000-0000-0000-0000-000000000031")


def user(role, entity_id=None):
    return {
        "roles": [role],
        "id_entidad": str(entity_id) if entity_id is not None else None,
    }


class TeacherRecordPolicyTests(unittest.TestCase):
    def test_administrator_can_read_teacher_record(self):
        assert_can_read_teacher_record(user("ADMIN"), TEACHER_ID)

    def test_teacher_can_read_own_record(self):
        assert_can_read_teacher_record(
            user("DOCENTE", TEACHER_ID),
            TEACHER_ID,
        )

    def test_teacher_cannot_read_another_record(self):
        with self.assertRaises(HTTPException) as raised:
            assert_can_read_teacher_record(
                user("DOCENTE", OTHER_TEACHER_ID),
                TEACHER_ID,
            )

        self.assertEqual(raised.exception.status_code, 403)

    def test_non_teacher_with_matching_identifier_is_denied(self):
        with self.assertRaises(HTTPException) as raised:
            assert_can_read_teacher_record(
                user("ALUMNO", TEACHER_ID),
                TEACHER_ID,
            )

        self.assertEqual(raised.exception.status_code, 403)


class TeacherDirectoryRouterPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.router = (
            BACKEND_ROOT / "app" / "routers" / "docentes.py"
        ).read_text(encoding="utf-8")

    def _endpoint_section(self, start: str, end: str) -> str:
        return self.router.split(start, 1)[1].split(end, 1)[0]

    def test_teacher_directory_requires_administrator(self):
        section = self._endpoint_section(
            "async def listar_docentes(",
            "async def obtener_kardex_propio(",
        )
        self.assertIn("Depends(require_admin)", section)
        self.assertNotIn("Depends(get_current_user)", section)

    def test_teacher_profile_uses_owner_policy(self):
        section = self._endpoint_section(
            "async def obtener_docente(",
            "async def crear_docente(",
        )
        self.assertIn(
            "assert_can_read_teacher_record(user, docente_id)",
            section,
        )

    def test_teacher_groups_use_owner_policy(self):
        section = self._endpoint_section(
            "async def grupos_del_docente(",
            "async def obtener_analytics_docente(",
        )
        self.assertIn(
            "assert_can_read_teacher_record(user, docente_id)",
            section,
        )


if __name__ == "__main__":
    unittest.main()
