"""Transactional operations for academic grades."""

from asyncpg import Connection


async def guardar_calificaciones_atomicas(
    conn: Connection,
    *,
    actividad_id: int,
    calificaciones: list,
    docente_id,
    usuario_id: str,
    motivo: str | None,
) -> int:
    """Persist a complete batch or roll it back when any item fails."""
    async with conn.transaction():
        await conn.execute(
            "SELECT set_config('app.usuario_id',$1,TRUE), set_config('app.motivo',$2,TRUE)",
            usuario_id,
            motivo or "",
        )
        for item in calificaciones:
            await conn.execute(
                "CALL academ.sp_registrar_calificacion($1,$2,$3,$4,$5,$6)",
                item.inscripcion_id,
                actividad_id,
                item.calificacion,
                item.estado_entrega,
                docente_id,
                motivo,
            )
    return len(calificaciones)
