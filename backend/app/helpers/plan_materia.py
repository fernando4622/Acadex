"""Consultas compartidas para resolver materias vinculadas a planes de estudio."""

from __future__ import annotations

from asyncpg import Connection


async def resolver_grupo_desde_clave_materia(
    conn: Connection,
    clave_materia: str,
    carrera_clave_opcional: str | None = None,
) -> dict:
    """Resuelve la materia y carrera de un grupo desde la retícula vigente."""
    clave_normalizada = str(clave_materia).strip().upper()
    if not clave_normalizada:
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
        clave_normalizada,
    )

    if not rows:
        raise ValueError(
            f"La clave de materia '{clave_normalizada}' no está asignada a ningún Plan de Estudios (retícula). "
            "Vincule la materia a un plan en 'Planes de Estudio' antes de crear grupos."
        )

    carrera_normalizada = (carrera_clave_opcional or "").strip().upper() or None
    if len(rows) == 1:
        seleccionada = rows[0]
    elif carrera_normalizada:
        coincidencias = [
            row for row in rows if row["carrera_clave"] == carrera_normalizada
        ]
        if len(coincidencias) != 1:
            raise ValueError(
                f"carrera_clave='{carrera_normalizada}' no desambigua la materia "
                f"'{clave_normalizada}' (coincidencias={len(coincidencias)})."
            )
        seleccionada = coincidencias[0]
    else:
        opciones = ", ".join(sorted({row["carrera_clave"] for row in rows}))
        raise ValueError(
            f"La materia '{clave_normalizada}' está en varias carreras ({opciones}). "
            "Agregue columna 'carrera' o 'carrera_clave' al CSV."
        )

    return {
        "materia_id": seleccionada["materia_id"],
        "carrera_id": seleccionada["carrera_id"],
        "clave": seleccionada["materia_clave"],
    }
