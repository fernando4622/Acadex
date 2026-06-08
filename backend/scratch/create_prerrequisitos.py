import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def apply_migration():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    
    try:
        async with conn.transaction():
            print("Creando tabla 'prerrequisito'...")
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS academ.prerrequisito (
                    id SERIAL PRIMARY KEY,
                    plan_materia_id INTEGER NOT NULL REFERENCES academ.plan_materia(id) ON DELETE CASCADE,
                    requisito_id INTEGER NOT NULL REFERENCES academ.plan_materia(id) ON DELETE CASCADE,
                    activo BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                    CONSTRAINT uq_prerrequisito UNIQUE(plan_materia_id, requisito_id),
                    CONSTRAINT ck_no_autorreferencia CHECK(plan_materia_id <> requisito_id)
                );
            """)

            print("Creando función de validación de planes...")
            await conn.execute("""
                CREATE OR REPLACE FUNCTION academ.fn_validar_plan_prerrequisito()
                RETURNS TRIGGER AS $$
                DECLARE
                    plan_destino INTEGER;
                    plan_requisito INTEGER;
                BEGIN
                    -- Obtener el plan de la materia destino
                    SELECT plan_estudio_id INTO plan_destino FROM academ.plan_materia WHERE id = NEW.plan_materia_id;
                    -- Obtener el plan de la materia requisito
                    SELECT plan_estudio_id INTO plan_requisito FROM academ.plan_materia WHERE id = NEW.requisito_id;

                    IF plan_destino <> plan_requisito THEN
                        RAISE EXCEPTION 'Conflicto de Plan: Ambas materias deben pertenecer al mismo plan de estudio (Destino: %, Requisito: %)', plan_destino, plan_requisito;
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            """)

            print("Creando trigger...")
            await conn.execute("""
                DROP TRIGGER IF EXISTS tr_validar_plan_prerrequisito ON academ.prerrequisito;
                CREATE TRIGGER tr_validar_plan_prerrequisito
                BEFORE INSERT OR UPDATE ON academ.prerrequisito
                FOR EACH ROW EXECUTE FUNCTION academ.fn_validar_plan_prerrequisito();
            """)
            
            print("\n¡Migración completada exitosamente!")
            
    except Exception as e:
        print(f"\nERROR AL APLICAR MIGRACIÓN: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(apply_migration())
