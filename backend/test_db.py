import asyncio
from app.database import init_db, get_conn

async def run():
    await init_db()
    conn = await get_conn().__anext__()
    try:
        sql = """SELECT
               m.id, m.id AS materia_id, m.clave, m.nombre, m.creditos, m.horas_teoria, m.horas_practica, m.activa,
               (SELECT COUNT(*) FROM academ.unidad_plantilla up WHERE up.materia_id = m.id) as total_unidades,
               COALESCE(
                 (SELECT array_agg(DISTINCT pe.carrera_id)
                  FROM academ.plan_materia pm 
                  JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
                  WHERE pm.materia_id = m.id),
                 ARRAY[]::INT[]
               ) AS carreras_ids
           FROM academ.materia m"""
        rows = await conn.fetch(sql)
        print("Success!", len(rows))
    except Exception as e:
        print("ERROR:", str(e))
        import traceback
        traceback.print_exc()

asyncio.run(run())
