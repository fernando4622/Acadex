"""
Manejo centralizado de errores.

PostgreSQL lanza excepciones con códigos propios (P0001, P0002, etc.)
Este módulo las captura y las convierte en respuestas HTTP coherentes.
"""

import asyncpg
from fastapi import Request
from fastapi.responses import JSONResponse


# Mapa de códigos de error PostgreSQL → HTTP status + código legible
_PG_ERROR_MAP: dict[str, tuple[int, str]] = {
    "P0001": (422, "PONDERACION_INVALIDA"),
    "P0002": (422, "PONDERACION_EXCEDE_100"),
    "P0003": (403, "ALUMNO_NO_INSCRITO"),
    "P0004": (409, "UNIDAD_FINALIZADA"),
    "P0005": (422, "CALIFICACION_FUERA_DE_RANGO"),
    "P0006": (405, "OPERACION_NO_PERMITIDA"),
    "P0010": (404, "UNIDAD_NO_ENCONTRADA"),
    "P0011": (409, "ESTADO_UNIDAD_INVALIDO"),
    "P0012": (403, "DOCENTE_NO_AUTORIZADO"),
    "P0013": (422, "SUMA_PONDERACIONES_INCOMPLETA"),
    "P0014": (422, "CALIFICACIONES_FALTANTES"),
    "P0020": (409, "GRUPO_YA_FINALIZADO"),
    "P0021": (403, "DOCENTE_NO_AUTORIZADO"),
    "P0022": (409, "UNIDADES_SIN_CERRAR"),
    "P0030": (403, "DOCENTE_NO_AUTORIZADO"),
    "P0031": (409, "UNIDAD_FINALIZADA"),
    "P0032": (422, "BONUS_INVALIDO"),
    "P0040": (422, "JUSTIFICACION_REQUERIDA"),
    "P0041": (403, "DOCENTE_NO_AUTORIZADO"),
    "P0042": (422, "OVERRIDE_FUERA_DE_RANGO"),
    "P0043": (409, "RESULTADO_MATERIA_NO_EXISTE"),
}


def _extract_pg_message(exc: asyncpg.PostgresError) -> str:
    """Extrae el mensaje limpio de una excepción de PostgreSQL."""
    msg = str(exc.message) if hasattr(exc, "message") else str(exc)
    # Limpiar artefactos de formato del mensaje PostgreSQL
    return msg.replace("\\n", " ").strip()


async def pg_exception_handler(request: Request, exc: asyncpg.PostgresError) -> JSONResponse:
    """
    Captura cualquier error de asyncpg y lo convierte en una respuesta JSON coherente.
    Se registra en FastAPI como exception handler global.
    """
    sqlstate = exc.sqlstate if hasattr(exc, "sqlstate") else None
    mensaje = _extract_pg_message(exc)

    if sqlstate and sqlstate in _PG_ERROR_MAP:
        status_code, codigo = _PG_ERROR_MAP[sqlstate]
    elif isinstance(exc, asyncpg.UniqueViolationError):
        status_code, codigo = 409, "REGISTRO_DUPLICADO"
        mensaje = _friendly_unique_violation(exc)
    elif isinstance(exc, asyncpg.ForeignKeyViolationError):
        status_code, codigo = 422, "REFERENCIA_INVALIDA"
        mensaje = "El registro referenciado no existe."
    elif isinstance(exc, asyncpg.NotNullViolationError):
        status_code, codigo = 422, "CAMPO_REQUERIDO"
    elif isinstance(exc, asyncpg.CheckViolationError):
        status_code, codigo = 422, "VALIDACION_FALLIDA"
    else:
        status_code, codigo = 500, "ERROR_BASE_DE_DATOS"

    return JSONResponse(
        status_code=status_code,
        content={"error": codigo, "mensaje": mensaje},
    )


def _friendly_unique_violation(exc: asyncpg.UniqueViolationError) -> str:
    """Convierte mensajes de violación de unicidad en texto legible."""
    detail = str(exc.detail) if hasattr(exc, "detail") else ""
    if "matricula" in detail:
        return "Ya existe un alumno con esa matrícula."
    if "email" in detail:
        return "Ya existe un usuario con ese correo electrónico."
    if "num_empleado" in detail:
        return "Ya existe un docente con ese número de empleado."
    if "uq_grupo" in detail:
        return "Ya existe un grupo con ese nombre para esta materia en el periodo indicado."
    if "uq_inscripcion" in detail:
        return "El alumno ya está inscrito en este grupo."
    if "uq_unidad" in detail:
        return "Ya existe una unidad con ese número en este grupo."
    if "uq_resultado" in detail:
        return "Ya existe un resultado registrado para este alumno en esta actividad."
    return "El registro ya existe."
