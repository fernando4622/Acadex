import asyncio
import asyncpg
import os
import random
from dotenv import load_dotenv

# load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

async def generate_sql():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )

    try:
        # Check table for period
        try:
            periodos_exist = await conn.fetch("SELECT * FROM academ.periodo LIMIT 1")
            periodo_table = "academ.periodo"
        except Exception:
            periodo_table = "academ.periodo_academico"

        print(f"Using period table: {periodo_table}")
        
        docentes = await conn.fetch("SELECT id FROM academ.docente")
        docente_ids = [d['id'] for d in docentes]

        alumnos = await conn.fetch("SELECT id FROM academ.alumno")
        alumno_ids = [a['id'] for a in alumnos]
        
        plan_materias = await conn.fetch("SELECT id, materia_id FROM academ.plan_materia")

        sql = "-- SIMULACION DE PERIODOS, GRUPOS E INSCRIPCIONES\n\n"

        periodos = ['AD24', 'EJ25', 'AD25', 'EJ26']
        periodo_ids = {}
        for p in periodos:
            # We don't know the exact schema, so we insert into basic columns
            sql += f"INSERT INTO {periodo_table} (codigo, nombre, fecha_inicio, fecha_fin, estado) "
            sql += f"VALUES ('{p}', 'Periodo {p}', "
            if 'AD' in p:
                sql += f"'2024-08-01', '2024-12-15', " if '24' in p else f"'2025-08-01', '2025-12-15', "
            else:
                sql += f"'2025-01-01', '2025-06-15', " if '25' in p else f"'2026-01-01', '2026-06-15', "
            sql += "'ACTIVO' if p == 'EJ26' else 'CERRADO') ON CONFLICT DO NOTHING;\n"

        print(sql)

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(generate_sql())
