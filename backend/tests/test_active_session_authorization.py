import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID

from fastapi import HTTPException

from app.middleware.auth import get_current_user


USER_ID = UUID("00000000-0000-0000-0000-000000000001")
STUDENT_ID = UUID("00000000-0000-0000-0000-000000000040")


class FakeConnection:
    def __init__(self, account):
        self.account = account
        self.calls = []

    async def fetchrow(self, query, *args):
        self.calls.append((query, args))
        return self.account


def credentials():
    return SimpleNamespace(credentials="signed-token")


class ActiveSessionAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    @patch("app.middleware.auth.decode_token")
    async def test_active_account_refreshes_roles_and_entity(self, decode_token):
        decode_token.return_value = {
            "sub": str(USER_ID),
            "roles": ["DOCENTE"],
            "id_entidad": "stale-entity",
            "grupos": ["stale-group"],
        }
        conn = FakeConnection(
            {
                "activo": True,
                "roles": ["ALUMNO"],
                "alumno_id": STUDENT_ID,
                "docente_id": None,
            }
        )

        user = await get_current_user(credentials(), conn)

        self.assertEqual(user["roles"], ["ALUMNO"])
        self.assertEqual(user["id_entidad"], str(STUDENT_ID))
        self.assertNotIn("grupos", user)
        self.assertEqual(conn.calls[0][1], (USER_ID,))

    @patch("app.middleware.auth.decode_token")
    async def test_disabled_account_invalidates_existing_token(self, decode_token):
        decode_token.return_value = {"sub": str(USER_ID), "roles": ["ADMIN"]}
        conn = FakeConnection(
            {
                "activo": False,
                "roles": ["ADMIN"],
                "alumno_id": None,
                "docente_id": None,
            }
        )

        with self.assertRaises(HTTPException) as raised:
            await get_current_user(credentials(), conn)

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail["codigo"], "SESION_INACTIVA")

    @patch("app.middleware.auth.decode_token")
    async def test_deleted_account_invalidates_existing_token(self, decode_token):
        decode_token.return_value = {"sub": str(USER_ID), "roles": ["ADMIN"]}

        with self.assertRaises(HTTPException) as raised:
            await get_current_user(credentials(), FakeConnection(None))

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail["codigo"], "SESION_INACTIVA")

    @patch("app.middleware.auth.decode_token")
    async def test_malformed_subject_is_rejected_before_database_query(self, decode_token):
        decode_token.return_value = {"sub": "not-a-uuid", "roles": ["ADMIN"]}
        conn = FakeConnection(None)

        with self.assertRaises(HTTPException) as raised:
            await get_current_user(credentials(), conn)

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail["codigo"], "TOKEN_INVALIDO")
        self.assertEqual(conn.calls, [])

    @patch("app.middleware.auth.decode_token")
    async def test_missing_subject_is_rejected(self, decode_token):
        decode_token.return_value = {"roles": ["ADMIN"]}

        with self.assertRaises(HTTPException) as raised:
            await get_current_user(credentials(), FakeConnection(None))

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail["codigo"], "TOKEN_INVALIDO")


if __name__ == "__main__":
    unittest.main()
