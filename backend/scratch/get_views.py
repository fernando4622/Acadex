import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def get_views():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    
    views = ['v_resultados_parciales', 'v_analitica_docente', 'vw_mis_grupos', 'v_actividades_alumno', 'v_analitica_alumno']
    
    for v in views:
        res = await conn.fetchval(f"SELECT pg_get_viewdef('academ.{v}')")
        print(f"\n--- {v} ---")
        print(res)
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(get_views())
