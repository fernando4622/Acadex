"""
Manejo centralizado de errores.

PostgreSQL lanza excepciones con ERRCODE personalizado (P0001, P0002, etc.)
y mensajes descriptivos. Este módulo los convierte en respuestas HTTP legibles.

Mapa de ERRCODE → HTTP status:
  P0001  Unidad no en estado EDICION          → 409 Conflict
  P0002  Ponderación excede 100%              → 422 Unprocessable
  P0003  Alumno no inscrito en el grupo       → 403 Forbidden
  P0004  Unidad FINALIZADA                    → 409 Conflict
  P0005  Calificación fuera de rango          → 422 Unprocessable
  P0006  DELETE bloqueado                     → 405 Method Not Allowed
  P0010  Unidad no encontrada                 → 404 Not Found
  P0011  Estado de unidad incorrecto          → 409 Conflict
  P0012  Docente no autorizado                → 403 Forbidden
  P0013  Suma ponderaciones ≠ 100%            → 422 Unprocessable
  P0014  Faltan calificaciones al cerrar      → 409 Conflict
  P0020  Grupo ya finalizado                  → 409 Conflict
  P0021  Docente no autorizado al grupo       → 403 Forbidden
  P0022  Unidades abiertas al finalizar       → 409 Conflict
  P0030  Docente no autorizado (bonus)        → 403 Forbidden
  P0031  Bonus en unidad FINALIZADA           → 409 Conflict
  P0032  Bonus negativo                       → 422 Unprocessable
  P0040  Justificación override insuficiente  → 422 Unprocessable
  P0041  Docente no autorizado (override)     → 403 Forbidden
  P0042  Override fuera de rango              → 422 Unprocessable
  P0043  Sin resultado de materia             → 409 Conflict
  P0060  Recursos de grupos diferentes        → 404 Not Found
  P0061  Actor no autorizado para calificar   → 403 Forbidden
"""

from fastapi import HTTPException
import asyncpg

# ERRCODE PostgreSQL → (HTTP status, código interno legible)
_PG_ERROR_MAP: dict[str, tuple[int, str]] = {
    "P0001": (409, "ESTADO_INVALIDO"),
    "P0002": (422, "PONDERACION_EXCEDE_100"),
    "P0003": (403, "ALUMNO_NO_INSCRITO"),
    "P0004": (409, "UNIDAD_FINALIZADA"),
    "P0005": (422, "CALIFICACION_FUERA_DE_RANGO"),
    "P0006": (405, "DELETE_NO_PERMITIDO"),
    "P0010": (404, "UNIDAD_NO_ENCONTRADA"),
    "P0011": (409, "ESTADO_UNIDAD_INCORRECTO"),
    "P0012": (403, "DOCENTE_NO_AUTORIZADO"),
    "P0013": (422, "SUMA_PONDERACIONES_INCORRECTA"),
    "P0014": (409, "CALIFICACIONES_INCOMPLETAS"),
    "P0020": (409, "GRUPO_YA_FINALIZADO"),
    "P0021": (403, "DOCENTE_NO_AUTORIZADO"),
    "P0022": (409, "UNIDADES_ABIERTAS"),
    "P0030": (403, "DOCENTE_NO_AUTORIZADO"),
    "P0031": (409, "UNIDAD_FINALIZADA"),
    "P0032": (422, "BONUS_NEGATIVO"),
    "P0040": (422, "JUSTIFICACION_INSUFICIENTE"),
    "P0041": (403, "DOCENTE_NO_AUTORIZADO"),
    "P0042": (422, "OVERRIDE_FUERA_DE_RANGO"),
    "P0043": (409, "SIN_RESULTADO_MATERIA"),
    "P0060": (404, "RECURSO_ACADEMICO_NO_ENCONTRADO"),
    "P0061": (403, "DOCENTE_NO_AUTORIZADO"),
}


def handle_pg_error(e: asyncpg.PostgresError) -> HTTPException:
    """
    Convierte un error de PostgreSQL en una HTTPException de FastAPI.
    Si el ERRCODE no está en el mapa, devuelve 500.
    """
    sqlstate = e.sqlstate if hasattr(e, "sqlstate") else None
    mapping = _PG_ERROR_MAP.get(sqlstate)

    if mapping:
        status, codigo = mapping
        return HTTPException(
            status_code=status,
            detail={"codigo": codigo, "mensaje": str(e.args[0] if e.args else e)},
        )

    # Error no mapeado → 500 con el mensaje original para debugging
    return HTTPException(
        status_code=500,
        detail={"codigo": "ERROR_BASE_DE_DATOS", "mensaje": str(e)},
    )
