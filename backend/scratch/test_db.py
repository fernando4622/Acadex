import asyncio
import asyncpg

async def test():
    conn = await asyncpg.connect(user="postgres", password="superuser", database="postgres")
    try:
        res = await conn.fetch("SELECT id, codigo, nombre, fecha_inicio, fecha_fin, estado, created_at, updated_at FROM academ.periodo_academico LIMIT 1")
        print(res)
    except Exception as e:
        print("ERROR:", e)
    finally:
        await conn.close()

if __name__ == '__main__':
    asyncio.run(test())
