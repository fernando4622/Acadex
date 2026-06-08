import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def inspect():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    cols = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='academ' AND table_name='alumno'")
    for c in cols:
        print(f"{c['column_name']}: {c['data_type']}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(inspect())
