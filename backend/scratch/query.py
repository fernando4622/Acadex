import asyncio, asyncpg, os
from dotenv import load_dotenv

load_dotenv('backend/.env')

async def run():
    conn = await asyncpg.connect(user=os.getenv('DB_USER'), password=os.getenv('DB_PASSWORD'), database=os.getenv('DB_NAME'), host=os.getenv('DB_HOST'))
    val = await conn.fetchval("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_periodo_estado'")
    print(f"Constraint: {val}")
    await conn.close()

if __name__ == '__main__':
    asyncio.run(run())
