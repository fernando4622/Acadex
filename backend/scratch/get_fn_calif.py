import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def run():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    try:
        def_ = await conn.fetchval("SELECT routine_definition FROM information_schema.routines WHERE routine_schema='academ' AND routine_name='fn_calcular_resultado_materia'")
        print(def_)
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
