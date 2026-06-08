import asyncio
import asyncpg

async def main():
    try:
        conn = await asyncpg.connect('postgresql://postgres:12345@localhost:5432/academ_sim')
        # fetch data to trigger the error
        rows = await conn.fetch("""
            SELECT actividad_id, tipo_actividad, descripcion, ponderacion,
                  estatus_plazo,
                  unidad_id, unidad_numero, unidad_nombre, unidad_estado,
                  calificacion, estado_entrega, fecha_registro, fecha_modificacion
           FROM academ.v_actividades_alumno
           WHERE inscripcion_id='019deb88-f5cc-747b-80f4-5f42817b5618'::UUID
           ORDER BY unidad_numero, ponderacion
        """)
        print(rows)
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
