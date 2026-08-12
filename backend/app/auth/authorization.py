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


async def assert_can_read_group_results(
    conn: Connection,
    user: dict,
    grupo_id: UUID,
) -> None:
    """Allow administrators and the group's current teacher to read its roster results."""
    group = await conn.fetchrow(
        "SELECT docente_id FROM academ.grupo WHERE id=$1",
        grupo_id,
    )
    if not group:
        raise _not_found()

    if _has_role(user, "ADMIN"):
        return

    if _has_role(user, "DOCENTE") and str(user.get("id_entidad")) == str(group["docente_id"]):
        return

    # Group results expose the complete roster, so students never receive access.
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

    if _has_role(user, "ADMIN"):
        return

    entity_id = str(user.get("id_entidad"))
    if _has_role(user, "DOCENTE") and entity_id == str(resource["docente_id"]):
        return

    if (
        allow_student_owner
        and _has_role(user, "ALUMNO")
        and entity_id == str(resource["alumno_id"])
    ):
        return

    raise _forbidden()
