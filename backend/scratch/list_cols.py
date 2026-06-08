import os
import asyncio
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def check():
    try:
        conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
        for table in ['materia', 'plan_materia']:
            rows = await conn.fetch(f"SELECT column_name FROM information_schema.columns WHERE table_schema='academ' AND table_name='{table}'")
            cols = [r['column_name'] for r in rows]
            print(f"COLUMNS {table}: {cols}")
        await conn.close()
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(check())
