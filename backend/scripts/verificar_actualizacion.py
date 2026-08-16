"""Respalda la base actual y valida sus migraciones sobre una copia efímera."""

import argparse
import asyncio
import os
import secrets
import subprocess
from datetime import datetime
from pathlib import Path

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
from scripts.verificar_instalacion_limpia import (
    citar_identificador,
    generar_nombre_base_temporal,
    reemplazar_nombre_base,
)


BACKEND_ROOT = Path(__file__).resolve().parents[1]
DIRECTORIO_RESPALDOS = BACKEND_ROOT / "tmp" / "backups"
PG_DUMP = Path(r"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe")
PG_RESTORE = Path(r"C:\Program Files\PostgreSQL\18\bin\pg_restore.exe")
TABLAS_CONTEO = (
    "alumno",
    "docente",
    "grupo",
    "inscripcion",
    "resultado_actividad",
)


def entorno_postgresql() -> dict[str, str]:
    requeridas = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    faltantes = [nombre for nombre in requeridas if not os.getenv(nombre)]
    if faltantes:
        raise RuntimeError("Faltan variables de PostgreSQL: " + ", ".join(faltantes))
    entorno = os.environ.copy()
    entorno["PGPASSWORD"] = os.environ["DB_PASSWORD"]
    return entorno


def argumentos_conexion(nombre_base: str) -> list[str]:
    return [
        "--host", os.environ["DB_HOST"],
        "--port", os.environ["DB_PORT"],
        "--username", os.environ["DB_USER"],
        "--dbname", nombre_base,
        "--no-password",
    ]


def ejecutar_postgresql(ejecutable: Path, argumentos: list[str]) -> None:
    if not ejecutable.is_file():
        raise FileNotFoundError(f"No se encontró la herramienta PostgreSQL: {ejecutable}")
    resultado = subprocess.run(
        [str(ejecutable), *argumentos],
        env=entorno_postgresql(),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if resultado.returncode != 0:
        detalle = resultado.stderr.strip() or resultado.stdout.strip()
        raise RuntimeError(f"Falló {ejecutable.name}: {detalle}")


def ruta_respaldo() -> Path:
    marca = datetime.now().strftime("%Y%m%d-%H%M%S")
    return DIRECTORIO_RESPALDOS / f"acadex_pre_upgrade_{marca}_{secrets.token_hex(3)}.dump"


async def contar_datos(database_url: str) -> dict[str, int]:
    conexion = await asyncpg.connect(database_url)
    try:
        return {
            tabla: await conexion.fetchval(f"SELECT COUNT(*) FROM academ.{tabla}")
            for tabla in TABLAS_CONTEO
        }
    finally:
        await conexion.close()


async def verificar_actualizacion(database_url: str) -> tuple[Path, list[str]]:
    DIRECTORIO_RESPALDOS.mkdir(parents=True, exist_ok=True)
    respaldo = ruta_respaldo()
    nombre_origen = os.environ["DB_NAME"]
    ejecutar_postgresql(
        PG_DUMP,
        ["--format=custom", "--file", str(respaldo), *argumentos_conexion(nombre_origen)],
    )

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
        ejecutar_postgresql(
            PG_RESTORE,
            ["--exit-on-error", "--no-owner", "--no-privileges", *argumentos_conexion(nombre_temporal), str(respaldo)],
        )
        conteos_antes = await contar_datos(url_temporal)

        migraciones = descubrir_migraciones()
        aplicadas = await aplicar_migraciones(url_temporal, migraciones)
        conteos_despues = await contar_datos(url_temporal)
        if conteos_despues != conteos_antes:
            raise RuntimeError(
                f"La actualización alteró cantidades de datos: antes={conteos_antes}, "
                f"después={conteos_despues}"
            )

        estado = await leer_estado(url_temporal)
        faltantes = detectar_faltantes(estado)
        columnas_faltantes = detectar_columnas_faltantes(estado)
        if any(faltantes.values()) or columnas_faltantes:
            raise RuntimeError(
                "La copia actualizada no cumple el contrato: "
                f"objetos={faltantes}, columnas={columnas_faltantes}"
            )

        return respaldo, aplicadas
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
        description="Respalda ACADEX y prueba sus migraciones sobre una copia temporal."
    )
    parser.add_argument("--database-url", help="URL explícita de PostgreSQL")
    argumentos = parser.parse_args()

    cargar_env_local()
    database_url = obtener_url_base_datos(argumentos.database_url)
    respaldo, aplicadas = asyncio.run(verificar_actualizacion(database_url))
    print(f"Respaldo conservado: {respaldo}")
    print("Migraciones validadas en la copia: " + ", ".join(aplicadas))


if __name__ == "__main__":
    main()
