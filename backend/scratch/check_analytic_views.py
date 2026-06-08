import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:12345@localhost:5432/academ_sim"
    conn = await asyncpg.connect(db_url)
    
    views = ['v_analitica_docente', 'v_analitica_alumno']
    for v in views:
        res = await conn.fetchval(f"SELECT definition FROM pg_views WHERE schemaname = 'academ' AND viewname = '{v}'")
        print(f"--- {v} ---\n{res}\n")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
