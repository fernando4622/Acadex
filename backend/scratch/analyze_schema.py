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
    
    print("\n=== REPORTE DE ANÁLISIS DE LA BASE DE DATOS ===\n")
    
    # 1. Grupo
    print("--- Tabla 'grupo' ---")
    cols = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='academ' AND table_name='grupo'")
    print([c['column_name'] for c in cols])
    
    # 2. Inscripcion
    print("\n--- Tabla 'inscripcion' ---")
    cols = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='academ' AND table_name='inscripcion'")
    print([c['column_name'] for c in cols])
    
    # 3. Resultado_Materia
    print("\n--- Tabla 'resultado_materia' ---")
    cols = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='academ' AND table_name='resultado_materia'")
    print([c['column_name'] for c in cols])
    
    # 4. Restricciones en plan_materia
    print("\n--- Restricciones UNIQUE en 'plan_materia' ---")
    fks = await conn.fetch("""
        SELECT tc.constraint_name, string_agg(kcu.column_name, ', ') as columns
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'academ' 
          AND tc.table_name = 'plan_materia' 
          AND tc.constraint_type = 'UNIQUE'
        GROUP BY tc.constraint_name
    """)
    for f in fks:
        print(f"{f['constraint_name']}: {f['columns']}")

    await conn.close()

if __name__ == "__main__":
    asyncio.run(inspect())
