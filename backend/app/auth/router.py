from fastapi import APIRouter, Depends, HTTPException, status
from asyncpg import Connection
from app.database import get_conn
from app.auth.schemas import LoginRequest, TokenResponse, UsuarioCreate, CambiarPasswordRequest
from app.auth.service import authenticate, create_access_token, hash_password, verify_password
from app.middleware.auth import require_admin, get_current_user

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, conn: Connection = Depends(get_conn)):
    payload = await authenticate(body.username, body.password, conn)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"codigo": "CREDENCIALES_INVALIDAS",
                    "mensaje": "Usuario o contraseña incorrectos."},
        )
    token = create_access_token(payload)
    return TokenResponse(
        access_token=token,
        roles=payload["roles"],
        nombre=payload["nombre"],
        id_entidad=payload["id_entidad"],
    )


@router.post("/usuarios", status_code=201, dependencies=[Depends(require_admin)])
async def crear_usuario(body: UsuarioCreate, conn: Connection = Depends(get_conn)):
    """
    Crea un usuario y le asigna uno o varios roles.
    Si se indica alumno_id o docente_id, actualiza el campo usuario_id en esa entidad.
    El campo 'username' es el identificador de acceso (no_control para alumnos).
    """
    hashed = hash_password(body.password)
    async with conn.transaction():
        try:
            usuario_id = await conn.fetchval(
                "INSERT INTO academ.usuario (email, password_hash) VALUES ($1,$2) RETURNING id",
                body.username, hashed,
            )
        except Exception:
            raise HTTPException(409, detail={"codigo": "EMAIL_DUPLICADO",
                                              "mensaje": "Ya existe un usuario con ese correo/identificador."})

        # Asignar roles
        for rol_nombre in body.roles:
            rol_id = await conn.fetchval(
                "SELECT id FROM academ.rol WHERE nombre=$1", rol_nombre
            )
            if not rol_id:
                raise HTTPException(400, detail={"codigo": "ROL_INVALIDO",
                                                  "mensaje": f"El rol '{rol_nombre}' no existe."})
            await conn.execute(
                "INSERT INTO academ.usuario_rol (usuario_id, rol_id) VALUES ($1,$2)",
                usuario_id, rol_id,
            )

        # Vincular con alumno o docente si corresponde
        if body.alumno_id:
            await conn.execute(
                "UPDATE academ.alumno SET usuario_id=$1 WHERE id=$2",
                usuario_id, body.alumno_id,
            )
        if body.docente_id:
            await conn.execute(
                "UPDATE academ.docente SET usuario_id=$1 WHERE id=$2",
                usuario_id, body.docente_id,
            )

    return {"id": str(usuario_id), "username": body.username, "roles": body.roles}


@router.post("/cambiar-password")
async def cambiar_password(
    body: CambiarPasswordRequest,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    # Obtener el hash actual de la DB
    usuario_id = user["sub"]
    row = await conn.fetchrow(
        "SELECT password_hash FROM academ.usuario WHERE id = $1::uuid", usuario_id
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Usuario no encontrado."})

    # Verificar password actual
    if not verify_password(body.password_actual, row["password_hash"]):
        raise HTTPException(
            status_code=400,
            detail={"codigo": "CREDENCIALES_INVALIDAS", "mensaje": "La contraseña actual es incorrecta."}
        )

    # Actualizar con la nueva
    nuevo_hash = hash_password(body.password_nueva)
    await conn.execute(
        "UPDATE academ.usuario SET password_hash = $1 WHERE id = $2::uuid",
        nuevo_hash, usuario_id
    )

    return {"mensaje": "Contraseña actualizada exitosamente."}
