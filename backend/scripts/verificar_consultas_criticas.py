"""Ejecuta consultas de lectura representativas del núcleo académico de ACADEX."""

import argparse
import asyncio
from dataclasses import dataclass

import asyncpg

from scripts.aplicar_migraciones import cargar_env_local, obtener_url_base_datos


@dataclass(frozen=True)
class ConsultaCritica:
    nombre: str
    sql: str


CONSULTAS_CRITICAS = (
    ConsultaCritica(
        "inscripciones y grupos vigentes",
        """
        SELECT i.id AS inscripcion_id, a.no_control, g.id AS grupo_id,
               g.plan_materia_id, g.periodo_id
        FROM academ.inscripcion i
        JOIN academ.alumno a ON a.id = i.alumno_id
        JOIN academ.grupo g ON g.id = i.grupo_id
        LIMIT 1
        """,
    ),
    ConsultaCritica(
        "captura de calificaciones",
        """
        SELECT i.id AS inscripcion_id, a.no_control, ra.actividad_id,
               ra.calificacion, ra.estado_entrega
        FROM academ.inscripcion i
        JOIN academ.alumno a ON a.id = i.alumno_id
        LEFT JOIN academ.resultado_actividad ra ON ra.inscripcion_id = i.id
        LIMIT 1
        """,
    ),
    ConsultaCritica(
        "resultados finales",
        """
        SELECT no_control, alumno, inscripcion_id, resultado_final, estatus
        FROM academ.v_resultados_finales
        LIMIT 1
        """,
    ),
    ConsultaCritica(
        "resultados parciales",
        """
        SELECT no_control, alumno, inscripcion_id, unidad_id,
               COALESCE(resultado_persistido, resultado_estimado) AS resultado
        FROM academ.v_resultados_parciales
        LIMIT 1
        """,
    ),
    ConsultaCritica(
        "actividades publicadas para alumnos",
        """
        SELECT actividad_id, inscripcion_id, tipo_nombre
        FROM academ.v_actividades_alumno
        LIMIT 1
        """,
    ),
    ConsultaCritica(
        "cálculo dinámico de materia",
        """
        SELECT a.no_control, calculo.resultado_final, calculo.unidades_con_result
        FROM academ.inscripcion i
        JOIN academ.alumno a ON a.id = i.alumno_id
        LEFT JOIN LATERAL academ.fn_calcular_resultado_materia(i.id) calculo ON TRUE
        LIMIT 1
        """,
    ),
)


async def verificar_consultas(database_url: str) -> list[tuple[str, int]]:
    conexion = await asyncpg.connect(database_url)
    resultados = []
    try:
        async with conexion.transaction(readonly=True):
            for consulta in CONSULTAS_CRITICAS:
                filas = await conexion.fetch(consulta.sql)
                resultados.append((consulta.nombre, len(filas)))
    finally:
        await conexion.close()
    return resultados


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verifica consultas de lectura del núcleo académico de ACADEX."
    )
    parser.add_argument("--database-url", help="URL explícita de PostgreSQL")
    argumentos = parser.parse_args()

    cargar_env_local()
    database_url = obtener_url_base_datos(argumentos.database_url)
    resultados = asyncio.run(verificar_consultas(database_url))
    for nombre, filas in resultados:
        print(f"OK: {nombre} ({filas} fila(s) de muestra)")


if __name__ == "__main__":
    main()
