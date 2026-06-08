import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def inspect():
    try:
        conn = await asyncpg.connect(
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME"),
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT")
        )
        
        print("\n=== REPORTE DE ESTRUCTURA ACADÉMICA (PostgreSQL) ===\n")
        
        # 1. Verificar Tablas Principales
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'academ' 
            AND table_name IN ('materia', 'plan_materia', 'plan_estudio', 'carrera', 'unidad_plantilla')
        """)
        print(f"Tablas encontradas: {[t['table_name'] for t in tables]}")
        
        # 2. Detalles de plan_materia (La tabla clave)
        cols = await conn.fetch("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'academ' AND table_name = 'plan_materia'
            ORDER BY ordinal_position
        """)
        print("\nEstructura de 'plan_materia':")
        for c in cols:
            print(f"  - {c['column_name']}: {c['data_type']} (Nullable: {c['is_nullable']})")
            
        # 3. Verificar Llaves Foráneas (Relaciones)
        fks = await conn.fetch("""
            SELECT
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND tc.table_schema = 'academ'
            AND tc.table_name IN ('plan_materia', 'unidad_plantilla', 'plan_estudio')
        """)
        print("\nRelaciones (Foreign Keys):")
        for f in fks:
            print(f"  - {f['table_name']}.{f['column_name']} -> {f['foreign_table_name']}.{f['foreign_column_name']}")

        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(inspect())
