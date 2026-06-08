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
        rows = await conn.fetch("SELECT routine_name, routine_definition FROM information_schema.routines WHERE routine_schema='academ'")
        for r in rows:
            print(f"--- {r['routine_name']} ---")
            print(r['routine_definition'])
            print("\n")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
