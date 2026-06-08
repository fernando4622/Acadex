import asyncpg
from app.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def get_conn():
    """
    Dependency de FastAPI.
    Cada request obtiene su propia conexión del pool y la devuelve al terminar.
    search_path fijado a academ para no calificar cada objeto.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("SET search_path = academ, public")
        yield conn
