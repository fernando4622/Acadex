import asyncio
import asyncpg
import os
import traceback
from dotenv import load_dotenv

load_dotenv()

async def diagnose():
    conn = None
    try:
        conn = await asyncpg.connect(
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME"),
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT")
        )
        
        # Test 1: Get an alumno id
        alumno_row = await conn.fetchrow("SELECT id, plan_estudio_id FROM academ.alumno WHERE plan_estudio_id IS NOT NULL LIMIT 1")
        if not alumno_row:
            print("No alumnos with plan found.")
            return
            
        alumno_id = alumno_row['id']
        plan_id = alumno_row['plan_estudio_id']
        print(f"Testing with Alumno ID: {alumno_id}, Plan ID: {plan_id}")
        
        # Test 2: Plan materias query
        print("Testing plan_materias query...")
        plan_materias = await conn.fetch(
            """SELECT pm.id, pm.clave, pm.materia_id, pm.semestre, pm.orden, pm.obligatoria,
                      m.nombre as materia_nombre, m.creditos
               FROM academ.plan_materia pm
               JOIN academ.materia m ON m.id = pm.materia_id
               WHERE pm.plan_estudio_id = $1
               ORDER BY pm.semestre, pm.orden""",
            plan_id
        )
        print(f"Found {len(plan_materias)} materias.")
        
        # Test 3: Resultados query
        print("Testing resultados query...")
        # Simulating the function call
        resultados = await conn.fetch(
            """SELECT g.materia_id, 
                      MAX(calc.resultado_final) as calificacion,
                      MAX(CASE WHEN calc.resultado_final >= 70 THEN 'APROBADA' ELSE 'REPROBADA' END) as estado
               FROM academ.inscripcion i
               JOIN academ.grupo g ON g.id = i.grupo_id
               LEFT JOIN LATERAL academ.fn_calcular_resultado_materia(i.id) calc ON true
               WHERE i.alumno_id = $1
               GROUP BY g.materia_id""",
            alumno_id
        )
        print(f"Found {len(resultados)} resultados.")

    except Exception:
        traceback.print_exc()
    finally:
        if conn:
            await conn.close()

if __name__ == "__main__":
    asyncio.run(diagnose())
