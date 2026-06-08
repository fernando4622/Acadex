import asyncio
import asyncpg
import os
import random
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

async def generate():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )

    try:
        print("Starting mock data generation...")

        # 1. Ensure a Mock Docente exists where id == usuario_id
        mock_uuid = "00000000-0000-4000-8000-000000000001"
        try:
            await conn.execute("INSERT INTO academ.usuario (id, email, password_hash) VALUES ($1, 'mock@test.com', 'hash') ON CONFLICT DO NOTHING", mock_uuid)
            await conn.execute("INSERT INTO academ.docente (id, num_empleado, nombre, apellido_pat, fecha_nacimiento, email, usuario_id) VALUES ($1, 'MOCK1', 'Mock', 'Docente', '1980-01-01', 'mock@test.com', $1) ON CONFLICT DO NOTHING", mock_uuid)
            docente_ids = [(mock_uuid, mock_uuid)]
        except Exception as e:
            print("Could not create mock docente:", e)
            docentes = await conn.fetch("SELECT id, usuario_id FROM academ.docente WHERE usuario_id IS NOT NULL")
            docente_ids = [(d['id'], d['usuario_id']) for d in docentes]

        alumnos = await conn.fetch("SELECT id FROM academ.alumno")
        alumno_ids = [a['id'] for a in alumnos]

        plan_materias = await conn.fetch("SELECT id, materia_id, semestre FROM academ.plan_materia")

        # 2. Setup Periods
        periodos = [
            {'codigo': 'AD24', 'nombre': 'Agosto - Diciembre 2024', 'inicio': '2024-08-26', 'fin': '2024-12-13', 'estado': 'cerrado'},
            {'codigo': 'EJ25', 'nombre': 'Enero - Junio 2025', 'inicio': '2025-01-27', 'fin': '2025-06-30', 'estado': 'cerrado'},
            {'codigo': 'AD25', 'nombre': 'Agosto - Diciembre 2025', 'inicio': '2025-08-25', 'fin': '2025-12-12', 'estado': 'cerrado'},
            {'codigo': 'EJ26', 'nombre': 'Enero - Junio 2026', 'inicio': '2026-01-26', 'fin': '2026-06-19', 'estado': 'activo'},
        ]
        
        periodo_ids = []
        for p in periodos:
            row = await conn.fetchrow("SELECT id FROM academ.periodo_academico WHERE codigo = $1", p['codigo'])
            if not row:
                print(f"Creating period {p['codigo']}...")
                from datetime import date
                row = await conn.fetchrow(
                    "INSERT INTO academ.periodo_academico (codigo, nombre, fecha_inicio, fecha_fin, estado) "
                    "VALUES ($1, $2, $3, $4, $5) RETURNING id",
                    p['codigo'], p['nombre'], date.fromisoformat(p['inicio']), date.fromisoformat(p['fin']), p['estado']
                )
            periodo_ids.append((row['id'], p['codigo'], p['estado']))

        print(f"Periods ready: {periodo_ids}")

        # Limit how many plan_materias we use so we don't overwhelm the DB if there are hundreds
        # Let's use up to 10 plan_materias per period to simulate
        pm_subset = plan_materias[:10]

        for pid, pcode, pestado in periodo_ids:
            print(f"--- Generating data for Period {pcode} ---")
            
            for pm in pm_subset:
                docente_id, docente_usuario_id = random.choice(docente_ids)
                # Let's select a few random alumnos for this group
                grupo_alumnos = random.sample(alumno_ids, k=min(10, len(alumno_ids)))
                
                # 3. Create Group
                # We need to specify calificacion_maxima. In simulacion.sql it was 100.
                group = await conn.fetchrow(
                    "INSERT INTO academ.grupo (nombre, plan_materia_id, docente_id, periodo_id, calificacion_maxima, estado) "
                    "VALUES ($1, $2, $3, $4, 100, $5) RETURNING id",
                    f"GR-{pm['id']}-{pcode}", pm['id'], docente_id, pid, "ACTIVO"
                )
                group_id = group['id']
                
                # 4. Enrollments
                insc_ids = []
                for al in grupo_alumnos:
                    insc = await conn.fetchrow(
                        "INSERT INTO academ.inscripcion (alumno_id, grupo_id, periodo_id, estado) VALUES ($1, $2, $3, 'ACTIVA') RETURNING id",
                        al, group_id, pid
                    )
                    insc_ids.append(insc['id'])

                # 5. Units & Activities
                for i in range(1, 4):
                    unidad = await conn.fetchrow(
                        "INSERT INTO academ.unidad (grupo_id, numero, nombre) VALUES ($1, $2, $3) RETURNING id",
                        group_id, i, f"Unidad {i}"
                    )
                    unidad_id = unidad['id']
                    
                    actividad = await conn.fetchrow(
                        "INSERT INTO academ.actividad (unidad_id, nombre, ponderacion, orden, tipo, activa) "
                        "VALUES ($1, 'Examen', 100, 1, 'EXAMEN', TRUE) RETURNING id",
                        unidad_id
                    )
                    actividad_id = actividad['id']

                    # 6. Grades
                    for insc_id in insc_ids:
                        calificacion = random.randint(65, 100)
                        # We use execute for procedure: CALL academ.sp_registrar_calificacion
                        await conn.execute(
                            "CALL academ.sp_registrar_calificacion($1, $2, $3, 'ENTREGADA', $4)",
                            insc_id, actividad_id, float(calificacion), docente_usuario_id
                        )
                    
                    # Close unit
                    await conn.execute("CALL academ.sp_cerrar_unidad($1, $2, FALSE)", unidad_id, docente_usuario_id)

                # 7. Group Closure (if period is CERRADO)
                if pestado == 'cerrado':
                    await conn.execute("CALL academ.sp_pre_cerrar_materia($1, $2)", group_id, docente_usuario_id)
                    await conn.execute("CALL academ.sp_finalizar_materia($1, $2)", group_id, docente_usuario_id)

        print("Simulation data generated successfully!")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(generate())
