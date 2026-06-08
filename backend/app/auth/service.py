from datetime import datetime, timedelta, timezone
from jose import jwt
from bcrypt import checkpw, hashpw, gensalt
import asyncpg
from app.config import settings


def hash_password(plain: str) -> str:
    return hashpw(plain.encode(), gensalt(12)).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        match = checkpw(plain.strip().encode('utf-8'), hashed.strip().encode('utf-8'))
        return match
    except Exception:
        return False

def create_access_token(payload: dict) -> str:
    data = payload.copy()
    data["exp"] = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


async def authenticate(username: str, password: str, conn: asyncpg.Connection) -> dict | None:
    """
    Busca el usuario por email (campo de login principal),
    verifica contraseña y construye el payload del JWT.
    """
    row = await conn.fetchrow(
        """
        SELECT
            u.id, u.email, u.password_hash, u.activo,
            -- roles como array agregado
            academ.fn_roles_usuario(u.id)               AS roles,
            -- perfil académico (solo uno puede estar activo)
            al.id                                        AS alumno_id,
            al.nombre || ' ' || al.apellido_pat          AS alumno_nombre,
            d.id                                         AS docente_id,
            d.nombre  || ' ' || d.apellido_pat           AS docente_nombre
        FROM   academ.usuario u
        LEFT JOIN academ.alumno  al ON al.usuario_id = u.id
        LEFT JOIN academ.docente d  ON d.usuario_id  = u.id
        WHERE  LOWER(u.email) = LOWER($1)
        """,
        username,
    )

    if not row or not row["activo"]:
        return None
    if not verify_password(password, row["password_hash"]):
        return None

    await conn.execute(
        "UPDATE academ.usuario SET ultimo_acceso = NOW() WHERE id = $1", row["id"]
    )

    roles: list[str] = list(row["roles"] or [])

    # id_entidad: el alumno_id o docente_id ligado a esta cuenta
    id_entidad = row["alumno_id"] or row["docente_id"]
    id_entidad_str = str(id_entidad) if id_entidad else None

    # nombre a mostrar
    nombre = row["docente_nombre"] or row["alumno_nombre"] or row["email"]

    # grupos que imparte el docente (para autorización rápida sin BD en cada request)
    grupos: list[str] = []
    if "DOCENTE" in roles and row["docente_id"]:
        grupos_rows = await conn.fetch(
            """
            SELECT g.id
            FROM   academ.grupo    g
            JOIN   academ.docente  d ON d.id = g.docente_id
            WHERE  d.usuario_id = $1
            """,
            row["id"],
        )
        grupos = [str(r["id"]) for r in grupos_rows]

    return {
        "sub":        str(row["id"]),
        "username":   row["email"],
        "roles":      roles,
        "id_entidad": id_entidad_str,
        "grupos":     grupos,
        "nombre":     nombre,
    }
