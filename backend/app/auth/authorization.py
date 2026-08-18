"""Resource-level authorization policies for academic data."""

from uuid import UUID

from asyncpg import Connection
from fastapi import HTTPException, status


def _has_role(user: dict, role: str) -> bool:
    return role in set(user.get("roles") or [])


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "codigo": "NO_ENCONTRADO",
            "mensaje": "El recurso académico solicitado no existe.",
        },
    )


def _forbidden() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "codigo": "SIN_PERMISO",
            "mensaje": "No tienes permiso para consultar este recurso académico.",
        },
    )


def _assert_can_read_student_resource(
    user: dict,
    *,
    alumno_id: UUID,
    docente_id: UUID,
    allow_student_owner: bool,
) -> None:
    if _has_role(user, "ADMIN"):
        return

    entity_id = str(user.get("id_entidad"))
    if _has_role(user, "DOCENTE") and entity_id == str(docente_id):
        return
    if (
        allow_student_owner
        and _has_role(user, "ALUMNO")
        and entity_id == str(alumno_id)
    ):
        return

    raise _forbidden()


def assert_can_read_student_record(user: dict, alumno_id: UUID) -> None:
    """Allow an administrator or the student who owns an individual record."""
    if _has_role(user, "ADMIN"):
        return
    if (
        _has_role(user, "ALUMNO")
        and str(user.get("id_entidad")) == str(alumno_id)
    ):
        return

    raise _forbidden()


async def assert_can_read_group_results(
    conn: Connection,
    user: dict,
    grupo_id: UUID,
) -> None:
    """Allow administrators and the group's current teacher to read its roster results."""
    await assert_can_manage_group(conn, user, grupo_id)


async def assert_can_manage_group(
    conn: Connection,
    user: dict,
    grupo_id: UUID,
) -> UUID:
    """Authorize against the teacher currently assigned to the group in PostgreSQL."""
    group = await conn.fetchrow(
        "SELECT docente_id FROM academ.grupo WHERE id=$1",
        grupo_id,
    )
    if not group:
        raise _not_found()

    if _has_role(user, "ADMIN"):
        return group["docente_id"]

    if _has_role(user, "DOCENTE") and str(user.get("id_entidad")) == str(group["docente_id"]):
        return group["docente_id"]

    raise _forbidden()


async def assert_can_read_group_content(
    conn: Connection,
    user: dict,
    grupo_id: UUID,
) -> None:
    """Allow current staff or an actively enrolled student to read group content."""
    group = await conn.fetchrow(
        "SELECT docente_id FROM academ.grupo WHERE id=$1",
        grupo_id,
    )
    if not group:
        raise _not_found()

    if _has_role(user, "ADMIN"):
        return

    entity_id = user.get("id_entidad")
    if _has_role(user, "DOCENTE") and str(entity_id) == str(group["docente_id"]):
        return

    if _has_role(user, "ALUMNO") and entity_id:
        try:
            student_id = UUID(str(entity_id))
        except ValueError:
            raise _forbidden()
        enrolled = await conn.fetchval(
            """
            SELECT EXISTS(
                SELECT 1 FROM academ.inscripcion
                WHERE grupo_id=$1 AND alumno_id=$2 AND estado='ACTIVA'
            )
            """,
            grupo_id,
            student_id,
        )
        if enrolled:
            return

    raise _forbidden()


async def assert_can_read_enrollment_unit(
    conn: Connection,
    user: dict,
    inscripcion_id: UUID,
    unidad_id: int,
    *,
    allow_student_owner: bool,
) -> None:
    """Authorize a result only when enrollment and unit belong to the same group."""
    resource = await conn.fetchrow(
        """
        SELECT i.alumno_id, g.docente_id
        FROM academ.inscripcion i
        JOIN academ.grupo g ON g.id = i.grupo_id
        JOIN academ.unidad u ON u.grupo_id = i.grupo_id
        WHERE i.id=$1 AND u.id=$2
        """,
        inscripcion_id,
        unidad_id,
    )
    if not resource:
        # A mismatched enrollment/unit pair is indistinguishable from a missing resource.
        raise _not_found()

    _assert_can_read_student_resource(
        user,
        alumno_id=resource["alumno_id"],
        docente_id=resource["docente_id"],
        allow_student_owner=allow_student_owner,
    )


async def assert_can_read_enrollment(
    conn: Connection,
    user: dict,
    inscripcion_id: UUID,
) -> None:
    """Authorize access using the enrollment's current student and teacher."""
    resource = await conn.fetchrow(
        """SELECT i.alumno_id, g.docente_id
           FROM academ.inscripcion i
           JOIN academ.grupo g ON g.id=i.grupo_id
           WHERE i.id=$1""",
        inscripcion_id,
    )
    if not resource:
        raise _not_found()

    _assert_can_read_student_resource(
        user,
        alumno_id=resource["alumno_id"],
        docente_id=resource["docente_id"],
        allow_student_owner=True,
    )


async def _get_activity_group(conn: Connection, actividad_id: int) -> UUID:
    grupo_id = await conn.fetchval(
        """SELECT u.grupo_id
           FROM academ.actividad a
           JOIN academ.unidad u ON u.id=a.unidad_id
           WHERE a.id=$1""",
        actividad_id,
    )
    if not grupo_id:
        raise _not_found()
    return grupo_id


async def assert_can_manage_activity(
    conn: Connection,
    user: dict,
    actividad_id: int,
) -> UUID:
    """Authorize against the current owner of an activity's group."""
    grupo_id = await _get_activity_group(conn, actividad_id)

    await assert_can_manage_group(conn, user, grupo_id)
    return grupo_id


async def authorize_activity_mutation(
    conn: Connection,
    user: dict,
    actividad_id: int,
    enrollment_ids: list[UUID],
) -> tuple[UUID, UUID]:
    """Authorize an activity and all enrollment targets before grade mutation."""
    grupo_id = await _get_activity_group(conn, actividad_id)
    teacher_id = await authorize_group_mutation(
        conn,
        user,
        grupo_id,
        enrollment_ids,
    )
    return grupo_id, teacher_id


async def authorize_group_mutation(
    conn: Connection,
    user: dict,
    grupo_id: UUID,
    enrollment_ids: list[UUID],
    *,
    unidad_id: int | None = None,
) -> UUID:
    """Validate the actor and every resource before an academic mutation starts."""
    teacher_id = await assert_can_manage_group(conn, user, grupo_id)

    unique_enrollment_ids = list(dict.fromkeys(enrollment_ids))
    matching_rows = await conn.fetch(
        """
        SELECT id
        FROM academ.inscripcion
        WHERE grupo_id=$1 AND id=ANY($2::uuid[])
        """,
        grupo_id,
        unique_enrollment_ids,
    )
    matching_ids = {str(row["id"]) for row in matching_rows}
    expected_ids = {str(enrollment_id) for enrollment_id in unique_enrollment_ids}
    if matching_ids != expected_ids:
        raise _not_found()

    if unidad_id is not None:
        unit_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM academ.unidad WHERE id=$1 AND grupo_id=$2)",
            unidad_id,
            grupo_id,
        )
        if not unit_exists:
            raise _not_found()

    return teacher_id
