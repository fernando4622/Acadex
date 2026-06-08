import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:12345@localhost:5432/academ_sim"
    conn = await asyncpg.connect(db_url)
    res = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema = 'academ' AND table_name = 'grupo'")
    for r in res:
        print(r['column_name'])
    await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
