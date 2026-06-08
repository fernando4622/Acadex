"""
Router de Auditoría — acceso exclusivo a ADMIN.
Expone la vista inmutable academ.v_auditoria para trazabilidad completa.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from asyncpg import Connection
from app.database import get_conn
from app.middleware.auth import require_admin

router = APIRouter(prefix="/auditoria", tags=["Auditoría"])


@router.get("")
async def listar_auditoria(
    tabla: Optional[str] = Query(default=None, description="Filtrar por tabla (ej: resultado_actividad)"),
    operacion: Optional[str] = Query(default=None, description="Filtrar por operación (INSERT, UPDATE, etc.)"),
    registro_id: Optional[str] = Query(default=None, description="Filtrar por ID del registro afectado"),
    limite: int = Query(default=100, ge=1, le=500),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """
    Retorna el historial de auditoría con filtros opcionales.
    Solo accesible para Administradores.
    """
    conditions = []
    params = []
    idx = 1

    if tabla:
        conditions.append(f"tabla = ${idx}")
        params.append(tabla)
        idx += 1
    if operacion:
        conditions.append(f"operacion = ${idx}")
        params.append(operacion)
        idx += 1
    if registro_id:
        conditions.append(f"registro_id = ${idx}")
        params.append(registro_id)
        idx += 1

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    query = f"""
        SELECT id, ts, tabla, registro_id, operacion,
               usuario_app, motivo, valor_anterior, valor_nuevo
        FROM academ.v_auditoria
        {where_clause}
        LIMIT ${idx}
    """
    params.append(limite)

    rows = await conn.fetch(query, *params)

    return [
        {
            "id":             r["id"],
            "ts":             r["ts"].isoformat() if r["ts"] else None,
            "tabla":          r["tabla"],
            "registro_id":    r["registro_id"],
            "operacion":      r["operacion"],
            "usuario_app":    str(r["usuario_app"]) if r["usuario_app"] else None,
            "motivo":         r["motivo"],
            "valor_anterior": r["valor_anterior"],
            "valor_nuevo":    r["valor_nuevo"],
        }
        for r in rows
    ]


@router.get("/tablas-disponibles")
async def tablas_disponibles(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """Retorna la lista de tablas que tienen registros en el log de auditoría."""
    rows = await conn.fetch(
        "SELECT DISTINCT tabla, COUNT(*) AS registros FROM academ.auditoria_log GROUP BY tabla ORDER BY tabla"
    )
    return [dict(r) for r in rows]
