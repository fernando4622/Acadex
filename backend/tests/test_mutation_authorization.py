import unittest
from uuid import UUID

from fastapi import HTTPException

from app.auth.authorization import authorize_group_mutation
from app.errors import _PG_ERROR_MAP


GROUP_ID = UUID("00000000-0000-0000-0000-000000000010")
TEACHER_ID = UUID("00000000-0000-0000-0000-000000000030")
OTHER_TEACHER_ID = UUID("00000000-0000-0000-0000-000000000031")
ENROLLMENT_ID = UUID("00000000-0000-0000-0000-000000000020")
OTHER_ENROLLMENT_ID = UUID("00000000-0000-0000-0000-000000000021")
UNIT_ID = 7


class FakeConnection:
    def __init__(self, *, group=None, enrollments=None, unit_exists=True):
        self.group = group
        self.enrollments = enrollments or []
        self.unit_exists = unit_exists
        self.calls = []

    async def fetchrow(self, query, *args):
        self.calls.append(("fetchrow", query, args))
        return self.group

    async def fetch(self, query, *args):
        self.calls.append(("fetch", query, args))
        return [{"id": enrollment_id} for enrollment_id in self.enrollments]

    async def fetchval(self, query, *args):
        self.calls.append(("fetchval", query, args))
        return self.unit_exists


def user(*roles, entity_id=None):
    return {
        "roles": list(roles),
        "id_entidad": str(entity_id) if entity_id is not None else None,
    }


class MutationAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    def connection(self, **overrides):
        values = {
            "group": {"docente_id": TEACHER_ID},
            "enrollments": [ENROLLMENT_ID],
            "unit_exists": True,
        }
        values.update(overrides)
        return FakeConnection(**values)

    async def test_current_teacher_can_mutate_matching_resources(self):
        conn = self.connection()

        teacher_id = await authorize_group_mutation(
            conn,
            user("DOCENTE", entity_id=TEACHER_ID),
            GROUP_ID,
            [ENROLLMENT_ID],
            unidad_id=UNIT_ID,
        )

        self.assertEqual(teacher_id, TEACHER_ID)

    async def test_admin_uses_the_groups_current_teacher_for_audit_fields(self):
        conn = self.connection()

        teacher_id = await authorize_group_mutation(
            conn, user("ADMIN"), GROUP_ID, [ENROLLMENT_ID]
        )

        self.assertEqual(teacher_id, TEACHER_ID)

    async def test_other_teacher_is_rejected_before_resource_queries(self):
        conn = self.connection()

        with self.assertRaises(HTTPException) as raised:
            await authorize_group_mutation(
                conn,
                user("DOCENTE", entity_id=OTHER_TEACHER_ID),
                GROUP_ID,
                [ENROLLMENT_ID],
            )

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual([call[0] for call in conn.calls], ["fetchrow"])

    async def test_cross_group_enrollment_is_rejected(self):
        conn = self.connection(enrollments=[])

        with self.assertRaises(HTTPException) as raised:
            await authorize_group_mutation(
                conn,
                user("DOCENTE", entity_id=TEACHER_ID),
                GROUP_ID,
                [OTHER_ENROLLMENT_ID],
            )

        self.assertEqual(raised.exception.status_code, 404)

    async def test_bulk_request_rejects_one_out_of_group_enrollment(self):
        conn = self.connection(enrollments=[ENROLLMENT_ID])

        with self.assertRaises(HTTPException) as raised:
            await authorize_group_mutation(
                conn,
                user("DOCENTE", entity_id=TEACHER_ID),
                GROUP_ID,
                [ENROLLMENT_ID, OTHER_ENROLLMENT_ID],
            )

        self.assertEqual(raised.exception.status_code, 404)

    async def test_duplicate_enrollments_are_validated_once(self):
        conn = self.connection()

        await authorize_group_mutation(
            conn,
            user("DOCENTE", entity_id=TEACHER_ID),
            GROUP_ID,
            [ENROLLMENT_ID, ENROLLMENT_ID],
        )

        enrollment_query = next(call for call in conn.calls if call[0] == "fetch")
        self.assertEqual(enrollment_query[2][1], [ENROLLMENT_ID])

    async def test_cross_group_unit_is_rejected(self):
        conn = self.connection(unit_exists=False)

        with self.assertRaises(HTTPException) as raised:
            await authorize_group_mutation(
                conn,
                user("DOCENTE", entity_id=TEACHER_ID),
                GROUP_ID,
                [ENROLLMENT_ID],
                unidad_id=UNIT_ID,
            )

        self.assertEqual(raised.exception.status_code, 404)

    async def test_missing_group_is_rejected_without_resource_queries(self):
        conn = self.connection(group=None)

        with self.assertRaises(HTTPException) as raised:
            await authorize_group_mutation(
                conn, user("ADMIN"), GROUP_ID, [ENROLLMENT_ID]
            )

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual([call[0] for call in conn.calls], ["fetchrow"])

    def test_database_scope_errors_have_safe_http_mappings(self):
        self.assertEqual(_PG_ERROR_MAP["P0060"], (404, "RECURSO_ACADEMICO_NO_ENCONTRADO"))
        self.assertEqual(_PG_ERROR_MAP["P0061"], (403, "DOCENTE_NO_AUTORIZADO"))


if __name__ == "__main__":
    unittest.main()
