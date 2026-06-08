import asyncio
import asyncpg
import os
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

async def run():
    dsn = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
    conn = await asyncpg.connect(dsn)
    try:
        print(f"Conectado a {dsn}")
        
        # 1. Modificar resultado_actividad para permitir registrado_por nulo
        await conn.execute("ALTER TABLE academ.resultado_actividad ALTER COLUMN registrado_por DROP NOT NULL;")
        print("Tabla resultado_actividad modificada: registrado_por ahora es opcional.")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
