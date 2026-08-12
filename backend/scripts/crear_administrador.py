"""Crea una cuenta administrativa sin almacenar credenciales en el repositorio."""

import argparse
import asyncio
import getpass
import os
import re
from urllib.parse import quote_plus

import asyncpg
from bcrypt import gensalt, hashpw


def validar_password(password: str) -> list[str]:
    errores = []
    if len(password) < 12:
        errores.append("debe contener al menos 12 caracteres")
    if not re.search(r"[a-z]", password):
        errores.append("debe incluir una letra minúscula")
    if not re.search(r"[A-Z]", password):
        errores.append("debe incluir una letra mayúscula")
    if not re.search(r"\d", password):
        errores.append("debe incluir un número")
    if not re.search(r"[^A-Za-z0-9]", password):
        errores.append("debe incluir un carácter especial")
    return errores


def obtener_url_base_datos(explicita: str | None) -> str:
    if explicita:
        return explicita
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    requeridas = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"]
    faltantes = [nombre for nombre in requeridas if not os.getenv(nombre)]
    if faltantes:
        raise RuntimeError(
            "Faltan variables de base de datos: " + ", ".join(faltantes)
        )

    usuario = quote_plus(os.environ["DB_USER"])
    password = quote_plus(os.environ["DB_PASSWORD"])
    return (
        f"postgresql://{usuario}:{password}@{os.environ['DB_HOST']}:"
        f"{os.environ['DB_PORT']}/{os.environ['DB_NAME']}"
    )


async def crear_administrador(database_url: str, email: str, password: str) -> None:
    conexion = await asyncpg.connect(database_url)
    try:
        async with conexion.transaction():
            existente = await conexion.fetchval(
                "SELECT EXISTS(SELECT 1 FROM academ.usuario WHERE LOWER(email)=LOWER($1))",
                email,
            )
            if existente:
                raise RuntimeError("Ya existe una cuenta con ese correo.")

            rol_id = await conexion.fetchval(
                "SELECT id FROM academ.rol WHERE nombre='ADMIN'"
            )
            if not rol_id:
                raise RuntimeError("El rol ADMIN no existe; aplica primero el esquema.")

            password_hash = hashpw(password.encode("utf-8"), gensalt(12)).decode()
            usuario_id = await conexion.fetchval(
                """
                INSERT INTO academ.usuario (email, password_hash)
                VALUES ($1, $2)
                RETURNING id
                """,
                email,
                password_hash,
            )
            await conexion.execute(
                """
                INSERT INTO academ.usuario_rol (usuario_id, rol_id, asignado_por)
                VALUES ($1, $2, $1)
                """,
                usuario_id,
                rol_id,
            )
    finally:
        await conexion.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Crea explícitamente el primer administrador de ACADEX."
    )
    parser.add_argument("--email", required=True, help="Correo del administrador")
    parser.add_argument(
        "--database-url",
        help="URL de PostgreSQL; por defecto usa DATABASE_URL o las variables DB_*",
    )
    argumentos = parser.parse_args()

    password = getpass.getpass("Contraseña nueva: ")
    confirmacion = getpass.getpass("Confirmar contraseña: ")
    if password != confirmacion:
        raise SystemExit("Las contraseñas no coinciden.")

    errores = validar_password(password)
    if errores:
        raise SystemExit("Contraseña insegura: " + "; ".join(errores) + ".")

    database_url = obtener_url_base_datos(argumentos.database_url)
    asyncio.run(crear_administrador(database_url, argumentos.email, password))
    print("Administrador creado correctamente.")


if __name__ == "__main__":
    main()
