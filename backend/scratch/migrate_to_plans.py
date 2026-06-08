import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run_migration():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:12345@localhost:5432/academ_sim"
    conn = await asyncpg.connect(db_url)
    
    print("Iniciando migración a modelo de Planes de Estudio...")
    
    async with conn.transaction():
        # 1. Crear tablas de backup por si acaso
        await conn.execute("CREATE TABLE IF NOT EXISTS academ._bkp_materia_carrera AS SELECT * FROM academ.materia_carrera")
        await conn.execute("CREATE TABLE IF NOT EXISTS academ._bkp_alumno AS SELECT * FROM academ.alumno")
        
        # 2. Crear academ.plan_estudio
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS academ.plan_estudio (
                id SERIAL PRIMARY KEY,
                carrera_id INTEGER NOT NULL REFERENCES academ.carrera(id),
                nombre TEXT NOT NULL,
                vigente BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 3. Crear academ.plan_materia
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS academ.plan_materia (
                id SERIAL PRIMARY KEY,
                plan_estudio_id INTEGER NOT NULL REFERENCES academ.plan_estudio(id),
                materia_id INTEGER NOT NULL REFERENCES academ.materia(id),
                clave TEXT NOT NULL,
                semestre INTEGER NOT NULL,
                orden INTEGER DEFAULT 0,
                obligatoria BOOLEAN DEFAULT TRUE,
                creditos_override INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(plan_estudio_id, clave),
                UNIQUE(plan_estudio_id, materia_id)
            )
        """)
        
        # 4. Crear planes iniciales para carreras existentes
        await conn.execute("""
            INSERT INTO academ.plan_estudio (carrera_id, nombre, vigente)
            SELECT id, 'Plan Inicial', TRUE FROM academ.carrera
            ON CONFLICT DO NOTHING
        """)
        
        # 5. Migrar materias de materia_carrera a plan_materia
        await conn.execute("""
            INSERT INTO academ.plan_materia (plan_estudio_id, materia_id, clave, semestre)
            SELECT pe.id, mc.materia_id, mc.clave, COALESCE(mc.semestre_referencia, 1)
            FROM academ.materia_carrera mc
            JOIN academ.plan_estudio pe ON pe.carrera_id = mc.carrera_id
            ON CONFLICT DO NOTHING
        """)
        
        # 6. Actualizar academ.materia con horas
        await conn.execute("ALTER TABLE academ.materia ADD COLUMN IF NOT EXISTS horas_teoria INTEGER DEFAULT 0")
        await conn.execute("ALTER TABLE academ.materia ADD COLUMN IF NOT EXISTS horas_practica INTEGER DEFAULT 0")
        
        # 7. Actualizar academ.alumno con plan_estudio_id
        await conn.execute("ALTER TABLE academ.alumno ADD COLUMN IF NOT EXISTS plan_estudio_id INTEGER REFERENCES academ.plan_estudio(id)")
        await conn.execute("""
            UPDATE academ.alumno a
            SET plan_estudio_id = pe.id
            FROM academ.plan_estudio pe
            WHERE pe.carrera_id = a.carrera_id
        """)
        
        # 8. Actualizar academ.grupo con plan_estudio_id
        await conn.execute("ALTER TABLE academ.grupo ADD COLUMN IF NOT EXISTS plan_estudio_id INTEGER REFERENCES academ.plan_estudio(id)")
        await conn.execute("""
            UPDATE academ.grupo g
            SET plan_estudio_id = pe.id
            FROM academ.plan_estudio pe
            WHERE pe.carrera_id = g.carrera_id
        """)
        
        # 9. Eliminar tabla obsoleta materia_carrera (opcional, pero la dejamos por ahora como respaldo)
        # await conn.execute("DROP TABLE academ.materia_carrera CASCADE")
        
    print("Migración de base de datos completada exitosamente.")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(run_migration())
