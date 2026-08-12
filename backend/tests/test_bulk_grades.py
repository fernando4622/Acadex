import unittest
from types import SimpleNamespace
from uuid import UUID

from pydantic import ValidationError

from app.schemas.calificacion import CalificacionBulkRequest
from app.services.calificaciones import guardar_calificaciones_atomicas


ENROLLMENT_1 = UUID("00000000-0000-0000-0000-000000000020")
ENROLLMENT_2 = UUID("00000000-0000-0000-0000-000000000021")
TEACHER_ID = UUID("00000000-0000-0000-0000-000000000030")


class FakeTransaction:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        self.connection.started = True
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        if exc_type is None:
            self.connection.committed = True
        else:
            self.connection.rolled_back = True
        return False


class FakeConnection:
    def __init__(self, *, fail_on_call=None):
        self.fail_on_call = fail_on_call
        self.execute_calls = []
        self.started = False
        self.committed = False
        self.rolled_back = False

    def transaction(self):
        return FakeTransaction(self)

    async def execute(self, query, *args):
        self.execute_calls.append((query, args))
        if self.fail_on_call == len(self.execute_calls):
            raise RuntimeError("simulated database failure")


def grade(enrollment_id):
    return SimpleNamespace(
        inscripcion_id=enrollment_id,
        calificacion=90,
        estado_entrega="ENTREGADA",
    )


class BulkGradeSchemaTests(unittest.TestCase):
    def test_empty_batch_is_rejected(self):
        with self.assertRaises(ValidationError):
            CalificacionBulkRequest(calificaciones=[])

    def test_duplicate_enrollment_is_rejected(self):
        item = {
            "inscripcion_id": ENROLLMENT_1,
            "calificacion": 90,
            "estado_entrega": "ENTREGADA",
        }

        with self.assertRaises(ValidationError):
            CalificacionBulkRequest(calificaciones=[item, item])


class AtomicBulkGradeTests(unittest.IsolatedAsyncioTestCase):
    async def test_successful_batch_commits_once(self):
        conn = FakeConnection()

        saved = await guardar_calificaciones_atomicas(
            conn,
            actividad_id=5,
            calificaciones=[grade(ENROLLMENT_1), grade(ENROLLMENT_2)],
            docente_id=TEACHER_ID,
            usuario_id="user-id",
            motivo="Captura ordinaria",
        )

        self.assertEqual(saved, 2)
        self.assertTrue(conn.started)
        self.assertTrue(conn.committed)
        self.assertFalse(conn.rolled_back)
        self.assertEqual(len(conn.execute_calls), 3)

    async def test_failure_rolls_back_and_propagates(self):
        # Call 1 configures audit context; call 2 saves the first grade;
        # call 3 fails while saving the second grade.
        conn = FakeConnection(fail_on_call=3)

        with self.assertRaisesRegex(RuntimeError, "simulated database failure"):
            await guardar_calificaciones_atomicas(
                conn,
                actividad_id=5,
                calificaciones=[grade(ENROLLMENT_1), grade(ENROLLMENT_2)],
                docente_id=TEACHER_ID,
                usuario_id="user-id",
                motivo="Captura ordinaria",
            )

        self.assertTrue(conn.started)
        self.assertFalse(conn.committed)
        self.assertTrue(conn.rolled_back)


if __name__ == "__main__":
    unittest.main()
