import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def fix_views():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    
    try:
        async with conn.transaction():
            print("Corrigiendo vistas analíticas...")
            
            # 1. v_analitica_docente (Usando LEFT JOIN para inscripciones)
            await conn.execute("""
                CREATE OR REPLACE VIEW academ.v_analitica_docente AS
                 WITH promedios_grupo AS (
                         SELECT g.id AS grupo_id, g.nombre AS grupo, g.docente_id, (((d.nombre)::text || ' '::text) || (d.apellido_pat)::text) AS docente,
                            m.id AS materia_id, m.nombre AS materia, p.codigo AS periodo, g.estado AS estado_grupo, 
                            COUNT(i.id) AS total_alumnos,
                            round(avg(rm.resultado_final), 2) AS promedio_grupo,
                            count(rm.id) FILTER (WHERE (rm.resultado_final >= (70)::numeric)) AS aprobados,
                            count(rm.id) FILTER (WHERE (rm.resultado_final < (70)::numeric)) AS reprobados,
                            round(stddev(rm.resultado_final), 2) AS desviacion_estandar
                           FROM academ.grupo g
                             JOIN academ.docente d ON d.id = g.docente_id
                             JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                             JOIN academ.materia m ON m.id = pm.materia_id
                             JOIN academ.periodo_academico p ON p.id = g.periodo_id
                             LEFT JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado::text = 'ACTIVA'::text
                             LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
                          GROUP BY g.id, g.nombre, g.docente_id, d.nombre, d.apellido_pat, m.id, m.nombre, p.codigo, g.estado
                        ), promedio_materia_periodo AS (
                         SELECT m.id AS materia_id, p.codigo AS periodo, round(avg(rm.resultado_final), 2) AS promedio_materia
                           FROM academ.resultado_materia rm
                             JOIN academ.inscripcion i ON i.id = rm.inscripcion_id
                             JOIN academ.grupo g ON g.id = i.grupo_id
                             JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                             JOIN academ.materia m ON m.id = pm.materia_id
                             JOIN academ.periodo_academico p ON p.id = g.periodo_id
                          GROUP BY m.id, p.codigo
                        )
                 SELECT pg.grupo_id, pg.grupo, pg.docente_id, pg.docente, pg.materia_id, pg.materia, pg.periodo, pg.estado_grupo, pg.total_alumnos, pg.promedio_grupo, pg.aprobados, pg.reprobados, pg.desviacion_estandar, pmp.promedio_materia,
                    round((COALESCE(pg.promedio_grupo,0) - COALESCE(pmp.promedio_materia,0)), 2) AS diferencia_vs_materia,
                        CASE
                            WHEN (pg.promedio_grupo > pmp.promedio_materia) THEN 'SOBRE_PROMEDIO'::text
                            WHEN (pg.promedio_grupo < pmp.promedio_materia) THEN 'BAJO_PROMEDIO'::text
                            ELSE 'EN_PROMEDIO'::text
                        END AS rendimiento_relativo,
                    round(((100.0 * (pg.aprobados)::numeric) / (NULLIF(pg.total_alumnos, 0))::numeric), 1) AS eficiencia_terminal_pct
                   FROM promedios_grupo pg
                     LEFT JOIN promedio_materia_periodo pmp ON pmp.materia_id = pg.materia_id AND pmp.periodo::text = pg.periodo::text;
            """)

            # 2. v_analitica_admin (Asegurando compatibilidad con plan_materia_id y LEFT JOIN)
            await conn.execute("""
                CREATE OR REPLACE VIEW academ.v_analitica_admin AS
                 SELECT m.id AS materia_id,
                    m.nombre AS materia,
                    pm.clave AS clave_materia,
                    p.codigo AS periodo,
                    count(DISTINCT g.id) AS num_grupos,
                    (((d.nombre)::text || ' '::text) || (d.apellido_pat)::text) AS docente,
                    g.id AS grupo_id,
                    g.nombre AS grupo,
                    count(i.id) AS total_inscritos,
                    count(rm.id) AS total_con_resultado,
                    round(avg(rm.resultado_final), 2) AS promedio_grupo,
                    count(rm.id) FILTER (WHERE (rm.resultado_final >= (70)::numeric)) AS aprobados,
                    count(rm.id) FILTER (WHERE (rm.resultado_final < (70)::numeric)) AS reprobados,
                    round(((100.0 * (count(rm.id) FILTER (WHERE (rm.resultado_final < (70)::numeric)))::numeric) / (NULLIF(count(rm.id), 0))::numeric), 1) AS tasa_reprobacion_pct,
                    round(((100.0 * (count(rm.id) FILTER (WHERE (rm.resultado_final >= (70)::numeric)))::numeric) / (NULLIF(count(i.id), 0))::numeric), 1) AS eficiencia_terminal_pct
                   FROM academ.grupo g
                     JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                     JOIN academ.materia m ON m.id = pm.materia_id
                     JOIN academ.docente d ON d.id = g.docente_id
                     JOIN academ.periodo_academico p ON p.id = g.periodo_id
                     LEFT JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado::text = 'ACTIVA'::text
                     LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
                  GROUP BY m.id, m.nombre, pm.clave, p.codigo, d.nombre, d.apellido_pat, g.id, g.nombre
            """)

            print("¡Vistas actualizadas exitosamente!")
            
    except Exception as e:
        print(f"Error al actualizar vistas: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(fix_views())
