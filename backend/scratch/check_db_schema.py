import asyncio
import os
from dotenv import load_dotenv
import asyncpg

load_dotenv()

async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    rows = await conn.fetch(
        """SELECT column_name, data_type 
           FROM information_schema.columns 
           WHERE table_schema = 'academ' AND table_name = 'grupo'"""
    )
    for row in rows:
        print(f"{row['column_name']}: {row['data_type']}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
