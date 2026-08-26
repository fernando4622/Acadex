"""
Middleware de autorización para RBAC multi-rol.

El JWT ahora lleva 'roles: list[str]' en lugar de 'rol: str'.
Un usuario puede tener varios roles simultáneamente, por ejemplo DOCENTE y ADMIN.

Regla: si tiene ADMIN, siempre pasa. Si tiene al menos uno de los roles requeridos, pasa.
"""
from uuid import UUID

from asyncpg import Connection
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from app.auth.service import decode_token
from app.database import get_conn

_bearer = HTTPBearer()


def _invalid_token() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"codigo": "TOKEN_INVALIDO", "mensaje": "Token inválido o expirado."},
    )


def _inactive_session() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "codigo": "SESION_INACTIVA",
            "mensaje": "La cuenta ya no está disponible o fue desactivada.",
        },
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    conn: Connection = Depends(get_conn),
) -> dict:
    try:
        payload = decode_token(credentials.credentials)
        usuario_id = UUID(str(payload["sub"]))
    except (JWTError, KeyError, TypeError, ValueError):
        raise _invalid_token()

    account = await conn.fetchrow(
        """SELECT u.activo, academ.fn_roles_usuario(u.id) AS roles,
                  al.id AS alumno_id, d.id AS docente_id
           FROM academ.usuario u
           LEFT JOIN academ.alumno al ON al.usuario_id=u.id
           LEFT JOIN academ.docente d ON d.usuario_id=u.id
           WHERE u.id=$1""",
        usuario_id,
    )
    if not account or not account["activo"]:
        raise _inactive_session()

    current_user = dict(payload)
    current_user["roles"] = list(account["roles"] or [])
    entity_id = account["alumno_id"] or account["docente_id"]
    current_user["id_entidad"] = str(entity_id) if entity_id else None
    current_user.pop("grupos", None)
    return current_user


def _tiene_rol(user: dict, *roles: str) -> bool:
    """True si el usuario tiene al menos uno de los roles indicados."""
    user_roles = set(user.get("roles", []))
    return bool(user_roles & set(roles))


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not _tiene_rol(user, "ADMIN"):
        raise HTTPException(403, detail={"codigo":"SIN_PERMISO","mensaje":"Requiere rol ADMIN."})
    return user


def require_docente(user: dict = Depends(get_current_user)) -> dict:
    if not _tiene_rol(user, "DOCENTE"):
        raise HTTPException(403, detail={"codigo":"SIN_PERMISO","mensaje":"Requiere rol DOCENTE."})
    return user


def require_alumno(user: dict = Depends(get_current_user)) -> dict:
    if not _tiene_rol(user, "ALUMNO"):
        raise HTTPException(403, detail={"codigo":"SIN_PERMISO","mensaje":"Requiere rol ALUMNO."})
    return user


def require_docente_o_admin(user: dict = Depends(get_current_user)) -> dict:
    if not _tiene_rol(user, "DOCENTE", "ADMIN"):
        raise HTTPException(403, detail={"codigo":"SIN_PERMISO","mensaje":"Requiere rol DOCENTE o ADMIN."})
    return user


def require_alumno_o_admin(user: dict = Depends(get_current_user)) -> dict:
    if not _tiene_rol(user, "ALUMNO", "ADMIN"):
        raise HTTPException(403, detail={"codigo":"SIN_PERMISO","mensaje":"Requiere rol ALUMNO o ADMIN."})
    return user


def is_admin(user: dict) -> bool:
    return _tiene_rol(user, "ADMIN")

def is_docente(user: dict) -> bool:
    return _tiene_rol(user, "DOCENTE")

def is_alumno(user: dict) -> bool:
    return _tiene_rol(user, "ALUMNO")
