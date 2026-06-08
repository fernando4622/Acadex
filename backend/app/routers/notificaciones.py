"""
Router de Notificaciones — badge interno sin dependencia de correo externo.
"""
from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection
from uuid import UUID

from app.database import get_conn
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/notificaciones", tags=["Notificaciones"])


@router.get("/mis-notificaciones")
async def mis_notificaciones(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """Devuelve las últimas 50 notificaciones del usuario autenticado."""
    rows = await conn.fetch(
        """SELECT id, tipo, titulo, mensaje, leida, created_at
           FROM academ.notificacion
           WHERE usuario_id = $1
           ORDER BY created_at DESC
           LIMIT 50""",
        user["usuario_id"],
    )
    return [dict(r) for r in rows]


@router.get("/no-leidas/count")
async def contar_no_leidas(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM academ.notificacion WHERE usuario_id=$1 AND leida=FALSE",
        user["usuario_id"],
    )
    return {"no_leidas": count}


@router.put("/{notif_id}/leer")
async def marcar_leida(
    notif_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    res = await conn.execute(
        "UPDATE academ.notificacion SET leida=TRUE WHERE id=$1 AND usuario_id=$2",
        notif_id, user["usuario_id"],
    )
    if res == "UPDATE 0":
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Notificación no encontrada."})
    return {"mensaje": "Notificación marcada como leída."}


@router.put("/marcar-todas-leidas")
async def marcar_todas_leidas(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    await conn.execute(
        "UPDATE academ.notificacion SET leida=TRUE WHERE usuario_id=$1 AND leida=FALSE",
        user["usuario_id"],
    )
    return {"mensaje": "Todas las notificaciones marcadas como leídas."}


# ── Función interna para crear notificaciones (usada por otros routers) ────────

async def crear_notificacion(
    conn: Connection,
    usuario_id: UUID,
    tipo: str,
    titulo: str,
    mensaje: str = None,
):
    """Crea una notificación interna. Llamada desde otros routers."""
    await conn.execute(
        """INSERT INTO academ.notificacion (usuario_id, tipo, titulo, mensaje)
           VALUES ($1, $2, $3, $4)""",
        usuario_id, tipo, titulo, mensaje,
    )
