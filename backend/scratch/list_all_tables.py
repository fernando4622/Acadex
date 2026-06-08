import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def list_tables():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    rows = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'academ' ORDER BY table_name")
    print("\n=== TODAS LAS TABLAS EN EL ESQUEMA 'ACADEM' ===\n")
    for r in rows:
        print(f"- {r['table_name']}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(list_tables())
