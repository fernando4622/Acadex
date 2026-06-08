import asyncio
import asyncpg
async def main():
    try:
        conn = await asyncpg.connect('postgresql://postgres:12345@localhost:5432/academ_sim')
        rows = await conn.fetch("SELECT * FROM academ.v_resultados_finales LIMIT 1")
        print('OK', rows)
        await conn.close()
    except Exception as e:
        print('ERROR:', e)
asyncio.run(main())
