"""Construye y verifica ACADEX dentro de una base de datos efímera."""

import argparse
import asyncio
import re
import secrets
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import asyncpg

from scripts.aplicar_migraciones import (
    aplicar_migraciones,
    cargar_env_local,
    descubrir_migraciones,
    obtener_url_base_datos,
)
from scripts.verificar_esquema import (
    detectar_columnas_faltantes,
    detectar_faltantes,
    leer_estado,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = PROJECT_ROOT / "bd" / "database.sql"
PREFIJO_BASE_TEMPORAL = "acadex_validacion_"
PATRON_BASE_TEMPORAL = re.compile(r"^acadex_validacion_[0-9a-f]{12}$")


def generar_nombre_base_temporal() -> str:
    return PREFIJO_BASE_TEMPORAL + secrets.token_hex(6)


def reemplazar_nombre_base(database_url: str, nombre: str) -> str:
    partes = urlsplit(database_url)
    if partes.scheme not in {"postgres", "postgresql"} or not partes.netloc:
        raise ValueError("DATABASE_URL debe ser una URL de PostgreSQL válida")
    if not re.fullmatch(r"[a-z0-9_]+", nombre):
        raise ValueError("Nombre de base de datos no válido")
    return urlunsplit(partes._replace(path="/" + quote(nombre, safe="")))


def citar_identificador(nombre: str) -> str:
    if not PATRON_BASE_TEMPORAL.fullmatch(nombre):
        raise ValueError("Solo se permiten bases temporales generadas por este verificador")
    return '"' + nombre + '"'


async def verificar_instalacion_limpia(database_url: str) -> str:
    nombre_temporal = generar_nombre_base_temporal()
    identificador = citar_identificador(nombre_temporal)
    url_mantenimiento = reemplazar_nombre_base(database_url, "postgres")
    url_temporal = reemplazar_nombre_base(database_url, nombre_temporal)
    creada = False

    conexion_admin = await asyncpg.connect(url_mantenimiento)
    try:
        await conexion_admin.execute(
            f"CREATE DATABASE {identificador} TEMPLATE template0 ENCODING 'UTF8'"
        )
        creada = True
    finally:
        await conexion_admin.close()

    try:
        conexion_temporal = await asyncpg.connect(url_temporal)
        try:
            await conexion_temporal.execute(BOOTSTRAP.read_text(encoding="utf-8-sig"))
        finally:
            await conexion_temporal.close()

        migraciones = descubrir_migraciones()
        aplicadas = await aplicar_migraciones(url_temporal, migraciones)
        if len(aplicadas) != len(migraciones):
            raise RuntimeError("La instalación limpia no registró todas las migraciones")

        estado = await leer_estado(url_temporal)
        faltantes = detectar_faltantes(estado)
        columnas_faltantes = detectar_columnas_faltantes(estado)
        if any(faltantes.values()) or columnas_faltantes:
            raise RuntimeError(
                "La instalación limpia no cumple el contrato: "
                f"objetos={faltantes}, columnas={columnas_faltantes}"
            )

        return nombre_temporal
    finally:
        if creada:
            conexion_admin = await asyncpg.connect(url_mantenimiento)
            try:
                await conexion_admin.execute(
                    f"DROP DATABASE IF EXISTS {identificador} WITH (FORCE)"
                )
            finally:
                await conexion_admin.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verifica el bootstrap y las migraciones en una base efímera."
    )
    parser.add_argument("--database-url", help="URL de PostgreSQL usada para crear la base temporal")
    argumentos = parser.parse_args()

    cargar_env_local()
    database_url = obtener_url_base_datos(argumentos.database_url)
    nombre = asyncio.run(verificar_instalacion_limpia(database_url))
    print(f"Instalación limpia verificada y eliminada: {nombre}")


if __name__ == "__main__":
    main()
