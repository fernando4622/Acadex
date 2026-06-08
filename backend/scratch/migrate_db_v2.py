import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def migrate():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    
    try:
        async with conn.transaction():
            print("1. Creando respaldo de tabla grupo...")
            await conn.execute("DROP TABLE IF EXISTS academ._bkp_grupo_v2")
            await conn.execute("CREATE TABLE academ._bkp_grupo_v2 AS SELECT * FROM academ.grupo")
            
            print("2. Modificando tabla grupo...")
            await conn.execute("ALTER TABLE academ.grupo ADD COLUMN IF NOT EXISTS plan_materia_id INTEGER")
            
            # Migrar datos: mapear materia_id + plan_estudio_id a plan_materia_id
            await conn.execute("""
                UPDATE academ.grupo g 
                SET plan_materia_id = (
                    SELECT pm.id FROM academ.plan_materia pm 
                    WHERE pm.materia_id = g.materia_id 
                      AND pm.plan_estudio_id = g.plan_estudio_id 
                    LIMIT 1
                )
            """)
            
            # Verificar si quedaron huérfanos y asignar uno por defecto si es estrictamente necesario, 
            # pero idealmente todos deberían mapear correctamente.
            
            print("   Eliminando columnas redundantes de grupo...")
            await conn.execute("ALTER TABLE academ.grupo DROP COLUMN IF EXISTS materia_id")
            await conn.execute("ALTER TABLE academ.grupo DROP COLUMN IF EXISTS carrera_id")
            await conn.execute("ALTER TABLE academ.grupo DROP COLUMN IF EXISTS plan_estudio_id")
            
            print("   Añadiendo FK a grupo...")
            # Limpiar grupos huerfanos que no se mapearon (por integridad referencial)
            await conn.execute("DELETE FROM academ.grupo WHERE plan_materia_id IS NULL")
            await conn.execute("ALTER TABLE academ.grupo ALTER COLUMN plan_materia_id SET NOT NULL")
            await conn.execute("ALTER TABLE academ.grupo ADD CONSTRAINT fk_grupo_plan_materia FOREIGN KEY (plan_materia_id) REFERENCES academ.plan_materia(id)")

            print("3. Modificando tabla inscripcion...")
            await conn.execute("ALTER TABLE academ.inscripcion ADD COLUMN IF NOT EXISTS periodo_id INTEGER")
            await conn.execute("""
                UPDATE academ.inscripcion i 
                SET periodo_id = (
                    SELECT g.periodo_id FROM academ.grupo g WHERE g.id = i.grupo_id
                )
            """)
            await conn.execute("DELETE FROM academ.inscripcion WHERE periodo_id IS NULL")
            await conn.execute("ALTER TABLE academ.inscripcion ALTER COLUMN periodo_id SET NOT NULL")
            await conn.execute("ALTER TABLE academ.inscripcion ADD CONSTRAINT fk_inscripcion_periodo FOREIGN KEY (periodo_id) REFERENCES academ.periodo_academico(id)")

            print("4. Añadiendo restricción posicional a plan_materia...")
            try:
                await conn.execute("ALTER TABLE academ.plan_materia ADD CONSTRAINT uq_plan_semestre_orden UNIQUE (plan_estudio_id, semestre, orden)")
            except Exception as e:
                print(f"   Advertencia: No se pudo crear la restricción UNIQUE en plan_materia. Probablemente hay materias con mismo semestre y orden. {e}")

            print("\n¡Migración de BD completada exitosamente!")
            
    except Exception as e:
        print(f"\nERROR CRÍTICO DURANTE LA MIGRACIÓN: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
