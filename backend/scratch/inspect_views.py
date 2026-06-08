import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:12345@localhost:5432/academ_sim"
    conn = await asyncpg.connect(db_url)
    res = await conn.fetch("""
        SELECT viewname, definition 
        FROM pg_views 
        WHERE schemaname = 'academ' 
        AND viewname IN ('v_resultados_finales', 'v_analitica_admin')
    """)
    for r in res:
        print(f"--- {r['viewname']} ---\n{r['definition']}\n")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
