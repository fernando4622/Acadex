import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:12345@localhost:5432/academ_sim"
    conn = await asyncpg.connect(db_url)
    res = await conn.fetchval("SELECT COUNT(*) FROM academ.grupo WHERE carrera_id IS NULL")
    print(f"Grupos sin carrera_id: {res}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
