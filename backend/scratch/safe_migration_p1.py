import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:12345@localhost:5432/academ_sim"
    conn = await asyncpg.connect(db_url)
    
    try:
        async with conn.transaction():
            print("Fase 1: Preparando nueva estructura (Sin borrar datos)...")
            
            # 1. Mejorar materia_carrera
            # Renombrar si existen, sino crear
            await conn.execute("ALTER TABLE academ.materia_carrera RENAME COLUMN clave_propia TO clave;")
            await conn.execute("ALTER TABLE academ.materia_carrera RENAME COLUMN semestre TO semestre_referencia;")
            await conn.execute("ALTER TABLE academ.materia_carrera ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'ACTIVA';")
            
            # Copiar claves de materia a materia_carrera para no perder información
            await conn.execute("""
                UPDATE academ.materia_carrera mc
                SET clave = m.clave
                FROM academ.materia m
                WHERE mc.materia_id = m.id AND (mc.clave IS NULL OR mc.clave = '');
            """)

            # 2. Mejorar grupo
            await conn.execute("ALTER TABLE academ.grupo ADD COLUMN IF NOT EXISTS carrera_id INTEGER REFERENCES academ.carrera(id);")
            
            # Intentar deducir carrera_id para grupos existentes basado en materia_carrera
            await conn.execute("""
                UPDATE academ.grupo g
                SET carrera_id = mc.carrera_id
                FROM academ.materia_carrera mc
                WHERE g.materia_id = mc.materia_id 
                AND g.carrera_id IS NULL;
            """)
            
            print("Estructura preparada y datos migrados internamente.")

    except Exception as e:
        print(f"Error controlado en Fase 1: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
