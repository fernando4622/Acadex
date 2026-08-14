"""Verifica que PostgreSQL contenga los objetos consumidos por el backend."""

import argparse
import asyncio
import re
from dataclasses import dataclass, field
from pathlib import Path

import asyncpg

from scripts.aplicar_migraciones import (
    cargar_env_local,
    descubrir_migraciones,
    obtener_url_base_datos,
)


TABLAS_REQUERIDAS = {
    "actividad",
    "alumno",
    "auditoria_log",
    "bonus_materia",
    "bonus_unidad",
    "carrera",
    "docente",
    "grupo",
    "inscripcion",
    "materia",
    "periodo_academico",
    "plan_estudio",
    "plan_materia",
    "resultado_actividad",
    "resultado_materia",
    "resultado_unidad",
    "rol",
    "tipo_actividad_catalogo",
    "unidad",
    "unidad_plantilla",
    "usuario",
    "usuario_rol",
}

# Estas tablas habilitan módulos avanzados, pero no forman parte del núcleo
# mínimo. Su ausencia se informa sin declarar inválida una instalación básica.
CAPACIDADES_OPCIONALES = {
    "avance_reticular": "seguimiento del avance académico",
    "entrega_actividad": "entrega y versionado de evidencias",
    "horario_grupo": "detección normalizada de choques de horario",
    "notificacion": "alertas internas para usuarios",
    "prerrequisito": "restricciones de inscripción entre materias",
}

RUTINAS_REQUERIDAS = {
    "fn_calcular_resultado_materia",
    "fn_calcular_resultado_unidad",
    "fn_desglose_alumno",
    "fn_generar_num_control",
    "fn_roles_usuario",
    "sp_activar_periodo",
    "sp_aplicar_bonus_unidad",
    "sp_cerrar_unidad",
    "sp_finalizar_materia",
    "sp_override_resultado_materia",
    "sp_pre_cerrar_materia",
    "sp_registrar_calificacion",
}

VISTAS_REQUERIDAS = {
    "v_actividades_alumno",
    "v_analitica_admin",
    "v_analitica_alumno",
    "v_analitica_docente",
    "v_auditoria",
    "v_captura_pendiente",
    "v_resultados_finales",
    "v_resultados_parciales",
    "v_suma_ponderaciones",
}

# Contrato de columnas vigente. Los nombres históricos como alumno.matricula,
# grupo.materia_id, periodo_academico.activo y actividad.tipo no son alias.
COLUMNAS_REQUERIDAS = {
    "actividad": {
        "id", "unidad_id", "tipo_catalogo_id", "descripcion", "ponderacion",
        "activa", "created_at", "updated_at",
    },
    "alumno": {
        "id", "no_control", "nombre", "apellido_pat", "apellido_mat", "email",
        "activo", "created_at", "updated_at", "usuario_id", "fecha_nacimiento",
        "curp", "semestre_actual", "plan_estudio_id",
    },
    "carrera": {"id", "clave", "nombre", "descripcion", "activo", "created_at"},
    "grupo": {
        "id", "nombre", "plan_materia_id", "docente_id", "periodo_id",
        "calificacion_maxima", "estado", "letra_grupo", "created_at", "updated_at",
    },
    "materia": {
        "id", "clave", "nombre", "creditos", "horas_teoria", "horas_practica",
        "activa", "created_at", "updated_at",
    },
    "periodo_academico": {
        "id", "codigo", "nombre", "fecha_inicio", "fecha_fin", "estado",
        "created_at", "updated_at",
    },
    "plan_estudio": {"id", "carrera_id", "nombre", "vigente", "created_at"},
    "plan_materia": {
        "id", "plan_estudio_id", "materia_id", "clave", "semestre", "orden",
        "obligatoria", "creditos_override", "created_at",
    },
    "tipo_actividad_catalogo": {
        "id", "nombre", "descripcion", "valor_ponderacion_sugerido", "activo",
        "created_at", "updated_at",
    },
}


@dataclass(frozen=True)
class EstadoEsquema:
    tablas: set[str]
    rutinas: set[str]
    vistas: set[str]
    columnas: dict[str, set[str]] = field(default_factory=dict)


PATRONES_OBJETOS = {
    "tablas": re.compile(
        r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:academ\.)?([a-z_][a-z0-9_]*)",
        re.IGNORECASE,
    ),
    "rutinas": re.compile(
        r"\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(?:academ\.)?([a-z_][a-z0-9_]*)",
        re.IGNORECASE,
    ),
    "vistas": re.compile(
        r"\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:academ\.)?([a-z_][a-z0-9_]*)",
        re.IGNORECASE,
    ),
}


def _sin_comentarios_sql(contenido: str) -> str:
    sin_bloques = re.sub(r"/\*.*?\*/", "", contenido, flags=re.DOTALL)
    return re.sub(r"--[^\r\n]*", "", sin_bloques)


def _fin_parentesis(contenido: str, inicio: int) -> int:
    profundidad = 0
    en_cadena = False
    indice = inicio
    while indice < len(contenido):
        caracter = contenido[indice]
        if caracter == "'":
            if en_cadena and indice + 1 < len(contenido) and contenido[indice + 1] == "'":
                indice += 2
                continue
            en_cadena = not en_cadena
        elif not en_cadena:
            if caracter == "(":
                profundidad += 1
            elif caracter == ")":
                profundidad -= 1
                if profundidad == 0:
                    return indice
        indice += 1
    raise ValueError("Definición CREATE TABLE sin paréntesis de cierre")


def _columnas_create_table(contenido: str) -> dict[str, set[str]]:
    columnas: dict[str, set[str]] = {}
    patron = re.compile(
        r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:academ\.)?"
        r"([a-z_][a-z0-9_]*)\s*\(",
        re.IGNORECASE,
    )
    ignorar = {"constraint", "primary", "unique", "check", "foreign", "exclude"}
    for coincidencia in patron.finditer(contenido):
        tabla = coincidencia.group(1).lower()
        inicio = coincidencia.end() - 1
        bloque = contenido[inicio + 1:_fin_parentesis(contenido, inicio)]
        profundidad = 0
        en_cadena = False
        inicio_segmento = 0
        segmentos = []
        for indice, caracter in enumerate(bloque):
            if caracter == "'":
                en_cadena = not en_cadena
            elif not en_cadena:
                if caracter == "(":
                    profundidad += 1
                elif caracter == ")":
                    profundidad -= 1
                elif caracter == "," and profundidad == 0:
                    segmentos.append(bloque[inicio_segmento:indice])
                    inicio_segmento = indice + 1
        segmentos.append(bloque[inicio_segmento:])
        for segmento in segmentos:
            token = re.match(r'\s*"?([a-z_][a-z0-9_]*)"?', segmento, re.IGNORECASE)
            if token and token.group(1).lower() not in ignorar:
                columnas.setdefault(tabla, set()).add(token.group(1).lower())
    return columnas


def _columnas_alter_table(contenido: str) -> dict[str, set[str]]:
    encontrados: dict[str, set[str]] = {}
    patron = re.compile(
        r"\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:academ\.)?([a-z_][a-z0-9_]*)"
        r"[\s\S]*?\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)",
        re.IGNORECASE,
    )
    for tabla, columna in patron.findall(contenido):
        encontrados.setdefault(tabla.lower(), set()).add(columna.lower())
    return encontrados


def leer_estado_fuentes_sql(fuentes: list[Path]) -> EstadoEsquema:
    """Extrae el inventario declarado por el bootstrap y sus migraciones."""
    contenido = "\n".join(
        fuente.read_text(encoding="utf-8-sig") for fuente in fuentes
    )
    contenido = _sin_comentarios_sql(contenido)
    encontrados = {
        categoria: {nombre.lower() for nombre in patron.findall(contenido)}
        for categoria, patron in PATRONES_OBJETOS.items()
    }
    columnas = _columnas_create_table(contenido)
    for tabla, nombres in _columnas_alter_table(contenido).items():
        columnas.setdefault(tabla, set()).update(nombres)
    return EstadoEsquema(**encontrados, columnas=columnas)


def fuentes_bootstrap(bootstrap: Path, migraciones_dir: Path) -> list[Path]:
    if not bootstrap.is_file():
        raise FileNotFoundError(f"No existe el bootstrap: {bootstrap}")
    migraciones = descubrir_migraciones(migraciones_dir)
    return [bootstrap, *(migracion.ruta for migracion in migraciones)]


def detectar_faltantes(estado: EstadoEsquema) -> dict[str, list[str]]:
    return {
        "tablas": sorted(TABLAS_REQUERIDAS - estado.tablas),
        "rutinas": sorted(RUTINAS_REQUERIDAS - estado.rutinas),
        "vistas": sorted(VISTAS_REQUERIDAS - estado.vistas),
    }


def detectar_capacidades_no_disponibles(estado: EstadoEsquema) -> dict[str, str]:
    return {
        tabla: descripcion
        for tabla, descripcion in CAPACIDADES_OPCIONALES.items()
        if tabla not in estado.tablas
    }


def detectar_columnas_faltantes(estado: EstadoEsquema) -> dict[str, list[str]]:
    return {
        tabla: sorted(requeridas - estado.columnas.get(tabla, set()))
        for tabla, requeridas in COLUMNAS_REQUERIDAS.items()
        if requeridas - estado.columnas.get(tabla, set())
    }


async def leer_estado(database_url: str) -> EstadoEsquema:
    conexion = await asyncpg.connect(database_url)
    try:
        tablas = await conexion.fetch(
            """
            SELECT table_name AS nombre
            FROM information_schema.tables
            WHERE table_schema='academ' AND table_type='BASE TABLE'
            """
        )
        rutinas = await conexion.fetch(
            """
            SELECT DISTINCT routine_name AS nombre
            FROM information_schema.routines
            WHERE routine_schema='academ'
            """
        )
        vistas = await conexion.fetch(
            """
            SELECT table_name AS nombre
            FROM information_schema.views
            WHERE table_schema='academ'
            """
        )
        columnas_rows = await conexion.fetch(
            """
            SELECT table_name AS tabla, column_name AS columna
            FROM information_schema.columns
            WHERE table_schema='academ'
            """
        )
    finally:
        await conexion.close()

    return EstadoEsquema(
        tablas={fila["nombre"] for fila in tablas},
        rutinas={fila["nombre"] for fila in rutinas},
        vistas={fila["nombre"] for fila in vistas},
        columnas={
            tabla: {fila["columna"] for fila in columnas_rows if fila["tabla"] == tabla}
            for tabla in {fila["tabla"] for fila in columnas_rows}
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verifica el contrato de esquema requerido por ACADEX."
    )
    parser.add_argument("--database-url", help="URL explícita de PostgreSQL")
    parser.add_argument(
        "--bootstrap",
        type=Path,
        help="Verifica un SQL de instalación junto con las migraciones soportadas",
    )
    parser.add_argument(
        "--migraciones-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "migrations",
        help="Directorio de migraciones usado con --bootstrap",
    )
    argumentos = parser.parse_args()

    if argumentos.bootstrap:
        estado = leer_estado_fuentes_sql(
            fuentes_bootstrap(argumentos.bootstrap, argumentos.migraciones_dir)
        )
    else:
        cargar_env_local()
        database_url = obtener_url_base_datos(argumentos.database_url)
        estado = asyncio.run(leer_estado(database_url))
    faltantes = detectar_faltantes(estado)
    columnas_faltantes = detectar_columnas_faltantes(estado)
    opcionales = detectar_capacidades_no_disponibles(estado)

    if any(faltantes.values()) or columnas_faltantes:
        print("El esquema no cumple el contrato mínimo del backend:")
        for categoria, nombres in faltantes.items():
            if nombres:
                print(f"- {categoria}: {', '.join(nombres)}")
        for tabla, nombres in columnas_faltantes.items():
            print(f"- columnas de {tabla}: {', '.join(nombres)}")
        raise SystemExit(1)

    print("El esquema cumple el contrato mínimo del backend.")
    if opcionales:
        print("Capacidades avanzadas todavía no disponibles:")
        for tabla, descripcion in opcionales.items():
            print(f"- {tabla}: {descripcion}")


if __name__ == "__main__":
    main()
