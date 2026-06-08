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
            print("Fase 2: Actualizando Vistas y eliminando columnas obsoletas...")
            
            # 1. Borrar vistas dependientes
            await conn.execute("DROP VIEW IF EXISTS academ.v_resultados_finales CASCADE;")
            await conn.execute("DROP VIEW IF EXISTS academ.v_analitica_admin CASCADE;")
            
            # 2. Ahora sí podemos borrar la clave de materia
            await conn.execute("ALTER TABLE academ.materia DROP COLUMN IF EXISTS clave;")
            
            # 3. Recrear v_resultados_finales
            await conn.execute("""
                CREATE OR REPLACE VIEW academ.v_resultados_finales AS
                 SELECT g.id AS grupo_id,
                    g.nombre AS grupo,
                    m.nombre AS materia,
                    mc.clave AS clave_materia,
                    p.codigo AS periodo,
                    (((d.nombre)::text || ' '::text) || (d.apellido_pat)::text) AS docente,
                    al.matricula,
                    (((al.nombre)::text || ' '::text) || (al.apellido_pat)::text) AS alumno,
                    i.id AS inscripcion_id,
                    round(rm.promedio_base, 2) AS promedio_base,
                    rm.bonus_aplicado AS bonus_materia,
                    round(rm.resultado_calculado, 2) AS resultado_calculado,
                    rm.resultado_override,
                    round(rm.resultado_final, 2) AS resultado_final,
                        CASE
                            WHEN (rm.resultado_final >= (70)::numeric) THEN 'APROBADO'::text
                            WHEN (rm.resultado_final < (70)::numeric) THEN 'REPROBADO'::text
                            ELSE 'PENDIENTE'::text
                        END AS estatus,
                    rm.justificacion_override,
                    rm.fecha_calculo
                   FROM (((((((academ.grupo g
                     JOIN academ.materia m ON ((m.id = g.materia_id)))
                     JOIN academ.materia_carrera mc ON ((mc.materia_id = g.materia_id AND mc.carrera_id = g.carrera_id)))
                     JOIN academ.periodo_academico p ON ((p.id = g.periodo_id)))
                     JOIN academ.docente d ON ((d.id = g.docente_id)))
                     JOIN academ.inscripcion i ON (((i.grupo_id = g.id) AND ((i.estado)::text = 'ACTIVA'::text))))
                     JOIN academ.alumno al ON ((al.id = i.alumno_id)))
                     LEFT JOIN academ.resultado_materia rm ON ((rm.inscripcion_id = i.id)))
                  ORDER BY g.nombre, al.apellido_pat, al.nombre;
            """)

            # 4. Recrear v_analitica_admin
            await conn.execute("""
                CREATE OR REPLACE VIEW academ.v_analitica_admin AS
                 SELECT m.id AS materia_id,
                    m.nombre AS materia,
                    mc.clave AS clave_materia,
                    p.codigo AS periodo,
                    count(DISTINCT g.id) AS num_grupos,
                    (((d.nombre)::text || ' '::text) || (d.apellido_pat)::text) AS docente,
                    g.id AS grupo_id,
                    g.nombre AS grupo,
                    count(i.id) AS total_inscritos,
                    count(rm.id) AS total_con_resultado,
                    round(avg(rm.resultado_final), 2) AS promedio_grupo,
                    round(max(rm.resultado_final), 2) AS calificacion_maxima,
                    round(min(rm.resultado_final), 2) AS calificacion_minima,
                    count(rm.id) FILTER (WHERE (rm.resultado_final >= (70)::numeric)) AS aprobados,
                    count(rm.id) FILTER (WHERE (rm.resultado_final < (70)::numeric)) AS reprobados,
                    round(((100.0 * (count(rm.id) FILTER (WHERE (rm.resultado_final < (70)::numeric)))::numeric) / (NULLIF(count(rm.id), 0))::numeric), 1) AS tasa_reprobacion_pct,
                    round(((100.0 * (count(rm.id) FILTER (WHERE (rm.resultado_final >= (70)::numeric)))::numeric) / (NULLIF(count(i.id), 0))::numeric), 1) AS eficiencia_terminal_pct
                   FROM ((((((academ.grupo g
                     JOIN academ.materia m ON ((m.id = g.materia_id)))
                     JOIN academ.materia_carrera mc ON ((mc.materia_id = g.materia_id AND mc.carrera_id = g.carrera_id)))
                     JOIN academ.docente d ON ((d.id = g.docente_id)))
                     JOIN academ.periodo_academico p ON ((p.id = g.periodo_id)))
                     JOIN academ.inscripcion i ON (((i.grupo_id = g.id) AND ((i.estado)::text = 'ACTIVA'::text))))
                     LEFT JOIN academ.resultado_materia rm ON ((rm.inscripcion_id = i.id)))
                  GROUP BY m.id, m.nombre, mc.clave, p.codigo, d.nombre, d.apellido_pat, g.id, g.nombre
                  ORDER BY (round(((100.0 * (count(rm.id) FILTER (WHERE (rm.resultado_final < (70)::numeric)))::numeric) / (NULLIF(count(rm.id), 0))::numeric), 1)) DESC NULLS LAST, (round(avg(rm.resultado_final), 2));
            """)
            
            print("Fase 2 completada. Vistas actualizadas y columna clave eliminada de materia.")

    except Exception as e:
        print(f"Error en Fase 2: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
