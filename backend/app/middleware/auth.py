"""
Middleware de autorización para RBAC multi-rol.

El JWT ahora lleva 'roles: list[str]' en lugar de 'rol: str'.
Un usuario puede tener varios roles simultáneamente, por ejemplo DOCENTE y ADMIN.

Regla: si tiene ADMIN, siempre pasa. Si tiene al menos uno de los roles requeridos, pasa.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from app.auth.service import decode_token

_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    try:
        return decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"codigo": "TOKEN_INVALIDO", "mensaje": "Token inválido o expirado."},
        )


def _tiene_rol(user: dict, *roles: str) -> bool:
    """True si el usuario tiene al menos uno de los roles indicados."""
    user_roles = set(user.get("roles", []))
    return bool(user_roles & set(roles))


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not _tiene_rol(user, "ADMIN"):
        raise HTTPException(403, detail={"codigo":"SIN_PERMISO","mensaje":"Requiere rol ADMIN."})
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
