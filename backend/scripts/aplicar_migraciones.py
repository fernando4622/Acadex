"""Aplica en orden las migraciones SQL soportadas de ACADEX."""

import argparse
import asyncio
import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote_plus

import asyncpg


DIRECTORIO_MIGRACIONES = Path(__file__).resolve().parents[1] / "migrations"
PATRON_MIGRACION = re.compile(r"^(?P<version>\d{3})_(?P<nombre>[a-z0-9_]+)\.sql$")


@dataclass(frozen=True)
class Migracion:
    version: str
    nombre: str
    ruta: Path
    contenido: str
    checksum: str


def descubrir_migraciones(directorio: Path = DIRECTORIO_MIGRACIONES) -> list[Migracion]:
    migraciones = []
    versiones = set()
    for ruta in sorted(directorio.glob("*.sql")):
        coincidencia = PATRON_MIGRACION.fullmatch(ruta.name)
        if not coincidencia:
            raise ValueError(f"Nombre de migración inválido: {ruta.name}")

        version = coincidencia.group("version")
        if version in versiones:
            raise ValueError(f"Versión de migración duplicada: {version}")
        versiones.add(version)

        contenido = ruta.read_text(encoding="utf-8")
        migraciones.append(
            Migracion(
                version=version,
                nombre=coincidencia.group("nombre"),
                ruta=ruta,
                contenido=contenido,
                checksum=hashlib.sha256(contenido.encode("utf-8")).hexdigest(),
            )
        )
    return migraciones


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


async def aplicar_migraciones(database_url: str, migraciones: list[Migracion]) -> list[str]:
    conexion = await asyncpg.connect(database_url)
    aplicadas_ahora = []
    try:
        async with conexion.transaction():
            await conexion.execute("SELECT pg_advisory_xact_lock(hashtext('acadex:migrations'))")
            await conexion.execute(
                """
                CREATE TABLE IF NOT EXISTS academ.migracion_esquema (
                    version         VARCHAR(3)  PRIMARY KEY,
                    nombre          VARCHAR(150) NOT NULL,
                    checksum_sha256 CHAR(64)    NOT NULL,
                    aplicada_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            registros = await conexion.fetch(
                "SELECT version, nombre, checksum_sha256 FROM academ.migracion_esquema"
            )
            aplicadas = {registro["version"]: registro for registro in registros}

            for migracion in migraciones:
                existente = aplicadas.get(migracion.version)
                if existente:
                    if existente["checksum_sha256"].strip() != migracion.checksum:
                        raise RuntimeError(
                            f"La migración {migracion.version} ya fue aplicada con otro checksum."
                        )
                    continue

                await conexion.execute(migracion.contenido)
                await conexion.execute(
                    """
                    INSERT INTO academ.migracion_esquema
                        (version, nombre, checksum_sha256)
                    VALUES ($1, $2, $3)
                    """,
                    migracion.version,
                    migracion.nombre,
                    migracion.checksum,
                )
                aplicadas_ahora.append(migracion.version)
    finally:
        await conexion.close()
    return aplicadas_ahora


def cargar_env_local() -> None:
    ruta_env = Path(__file__).resolve().parents[1] / ".env"
    if not ruta_env.exists():
        return
    for linea in ruta_env.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        os.environ.setdefault(clave.strip(), valor.strip())


def main() -> None:
    parser = argparse.ArgumentParser(description="Aplica migraciones de ACADEX en orden.")
    parser.add_argument("--database-url", help="URL explícita de PostgreSQL")
    parser.add_argument(
        "--listar",
        action="store_true",
        help="Muestra la secuencia soportada sin conectarse a PostgreSQL",
    )
    argumentos = parser.parse_args()
    migraciones = descubrir_migraciones()

    if argumentos.listar:
        for migracion in migraciones:
            print(f"{migracion.version} {migracion.nombre} {migracion.checksum[:12]}")
        return

    cargar_env_local()
    database_url = obtener_url_base_datos(argumentos.database_url)
    aplicadas = asyncio.run(aplicar_migraciones(database_url, migraciones))
    if aplicadas:
        print("Migraciones aplicadas: " + ", ".join(aplicadas))
    else:
        print("La base de datos ya está actualizada.")


if __name__ == "__main__":
    main()
