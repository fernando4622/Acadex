import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:12345@localhost:5432/academ_sim"
    conn = await asyncpg.connect(db_url)
    
    # Buscar funciones que usen 'clave' en su definición
    res = await conn.fetch("""
        SELECT routine_name, routine_definition 
        FROM information_schema.routines 
        WHERE routine_schema = 'academ' 
        AND routine_definition LIKE '%clave%'
    """)
    for r in res:
        print(f"--- {r['routine_name']} ---\n{r['routine_definition']}\n")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
