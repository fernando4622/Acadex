import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def check():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    rows = await conn.fetch("""
        SELECT a.matricula, a.nombre, a.plan_estudio_id, pe.nombre as plan_nombre
        FROM academ.alumno a
        LEFT JOIN academ.plan_estudio pe ON pe.id = a.plan_estudio_id
    """)
    for r in rows:
        print(f"Matricula: {r['matricula']} | Alumno: {r['nombre']} | Plan ID: {r['plan_estudio_id']} | Plan: {r['plan_nombre']}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
