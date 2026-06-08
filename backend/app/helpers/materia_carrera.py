"""Lógica compartida: vínculos academ.materia_carrera (solo materia_id + carrera_id)."""

from __future__ import annotations

from fastapi import HTTPException
from asyncpg import Connection


def dedupe_carreras_ids(carrera_ids: list[int]) -> list[int]:
    return list(dict.fromkeys(carrera_ids))


async def normalizar_carreras_activas(conn: Connection, carrera_ids: list[int], *, allow_empty: bool) -> list[int]:
    ids = dedupe_carreras_ids(carrera_ids)
    if not ids:
        if allow_empty:
            return []
        raise HTTPException(
            422,
            detail={"codigo": "SIN_CARRERAS", "mensaje": "Debe seleccionar al menos una carrera activa."},
        )
    rows = await conn.fetch(
        "SELECT id FROM academ.carrera WHERE id = ANY($1::INT[]) AND activo = TRUE",
        ids,
    )
    encontrados = {r["id"] for r in rows}
    if len(encontrados) != len(ids):
        raise HTTPException(
            422,
            detail={"codigo": "CARRERA_INVALIDA", "mensaje": "Una o más carreras no existen o están inactivas."},
        )
    return [cid for cid in ids if cid in encontrados]


async def sync_materia_carreras(conn: Connection, materia_id: int, carrera_ids: list[int]) -> None:
    rows = await conn.fetch(
        "SELECT carrera_id FROM academ.materia_carrera WHERE materia_id = $1", materia_id
    )
    actuales = {r["carrera_id"] for r in rows}
    nuevo = set(carrera_ids)
    for cid in actuales - nuevo:
        await conn.execute(
            "DELETE FROM academ.materia_carrera WHERE materia_id = $1 AND carrera_id = $2",
            materia_id,
            cid,
        )
    for cid in nuevo - actuales:
        await conn.execute(
            "INSERT INTO academ.materia_carrera (materia_id, carrera_id) VALUES ($1, $2)",
            materia_id,
            cid,
        )


async def resolver_celdas_carreras_materias_csv(conn: Connection, raw: str | None) -> list[int]:
    """
    Equivalente UX al catálogo: COMUN → todas las carreras activas;
    caso contrario, claves de carrera separadas por '|' (como las unidades con pipe).
    """
    if raw is None or not str(raw).strip():
        raise ValueError(
            "Indique carreras en la columna 'carreras' (o legado 'carrera'): COMUN o claves separadas por '|'."
        )

    texto = raw.strip()
    if texto.upper() == "COMUN":
        rows = await conn.fetch("SELECT id FROM academ.carrera WHERE activo = TRUE ORDER BY id")
        if not rows:
            raise ValueError("No hay carreras activas para usar COMUN.")
        return [r["id"] for r in rows]

    ids: list[int] = []
    for part in texto.split("|"):
        c_clave = part.strip().upper()
        if not c_clave:
            continue
        rid = await conn.fetchval(
            "SELECT id FROM academ.carrera WHERE UPPER(TRIM(clave)) = $1 AND activo = TRUE",
            c_clave,
        )
        if not rid:
            raise ValueError(f"Carrera '{c_clave}' no existe o está inactiva.")
        ids.append(rid)

    ids = dedupe_carreras_ids(ids)
    if not ids:
        raise ValueError("Sin claves de carrera válidas tras separar por '|'; use COMUN o ej. ISC|ICI.")
    return ids


async def resolver_grupo_desde_clave_materia(
    conn: Connection,
    clave_materia: str,
    carrera_clave_opcional: str | None = None,
) -> dict:
    """
    Obtiene materia_id y carrera_id para importación de grupo/inscripción usando academics.materia.clave,
    ante varias carreras requiere desambiguador en CSV (columna carrera / carrera_clave).
    """
    c_norm = str(clave_materia).strip().upper()
    if not c_norm:
        raise ValueError("clave_materia vacía.")

    rows = await conn.fetch(
        """
        SELECT pm.materia_id, pe.carrera_id, TRIM(pm.clave) AS materia_clave,
               UPPER(TRIM(c.clave)) AS carrera_clave
        FROM academ.plan_materia pm
        INNER JOIN academ.materia m ON m.id = pm.materia_id
        INNER JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
        INNER JOIN academ.carrera c ON c.id = pe.carrera_id AND c.activo = TRUE
        WHERE UPPER(TRIM(pm.clave)) = $1
        ORDER BY pe.carrera_id
        """,
        c_norm,
    )

    if not rows:
        raise ValueError(
            f"La clave de materia '{c_norm}' no está asignada a ningún Plan de Estudios (retícula). "
            f"Vincule la materia a un plan en 'Planes de Estudio' antes de crear grupos."
        )

    filt = (carrera_clave_opcional or "").strip().upper() or None
    if len(rows) == 1:
        chosen = rows[0]
    elif filt:
        matches = [r for r in rows if r["carrera_clave"] == filt]
        if len(matches) != 1:
            raise ValueError(
                f"carrera_clave='{filt}' no desambigua la materia '{c_norm}' (coincidencias={len(matches)})."
            )
        chosen = matches[0]
    else:
        opts = ", ".join(sorted({r["carrera_clave"] for r in rows}))
        raise ValueError(
            f"La materia '{c_norm}' está en varias carreras ({opts}). Agregue columna 'carrera' o 'carrera_clave' al CSV."
        )

    return {
        "materia_id": chosen["materia_id"],
        "carrera_id": chosen["carrera_id"],
        "clave": chosen["materia_clave"],
    }
