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
            print("Ejecutando rediseño de arquitectura de materias...")
            
            # 1. Ajustar materia_carrera (La nueva Identidad)
            # Renombrar columnas si existen
            await conn.execute("ALTER TABLE academ.materia_carrera RENAME COLUMN clave_propia TO clave;")
            await conn.execute("ALTER TABLE academ.materia_carrera RENAME COLUMN semestre TO semestre_referencia;")
            await conn.execute("ALTER TABLE academ.materia_carrera ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'ACTIVA';")
            
            # 2. Ajustar materia (La Plantilla)
            # Quitamos la clave global
            await conn.execute("ALTER TABLE academ.materia DROP COLUMN IF EXISTS clave;")
            
            print("Migración de base de datos completada exitosamente.")

    except Exception as e:
        print(f"Error en migración: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
