import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def migrate_with_views():
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
            
            # Eliminar vistas que dependen de materia_id en grupo
            print("   Eliminando vistas temporalmente...")
            await conn.execute("DROP VIEW IF EXISTS academ.v_resultados_parciales CASCADE")
            await conn.execute("DROP VIEW IF EXISTS academ.v_analitica_docente CASCADE")
            await conn.execute("DROP VIEW IF EXISTS academ.vw_mis_grupos CASCADE")
            await conn.execute("DROP VIEW IF EXISTS academ.v_actividades_alumno CASCADE")
            await conn.execute("DROP VIEW IF EXISTS academ.v_analitica_alumno CASCADE")

            print("   Eliminando columnas redundantes de grupo...")
            await conn.execute("ALTER TABLE academ.grupo DROP COLUMN IF EXISTS materia_id CASCADE")
            await conn.execute("ALTER TABLE academ.grupo DROP COLUMN IF EXISTS carrera_id CASCADE")
            await conn.execute("ALTER TABLE academ.grupo DROP COLUMN IF EXISTS plan_estudio_id CASCADE")
            
            print("   Añadiendo FK a grupo...")
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

            print("4. Restaurando vistas...")
            await conn.execute("""
                CREATE OR REPLACE VIEW academ.v_resultados_parciales AS
                 SELECT i.id AS inscripcion_id, al.matricula, (((al.nombre)::text || ' '::text) || (al.apellido_pat)::text) AS alumno,
                    g.id AS grupo_id, g.nombre AS grupo, m.nombre AS materia, u.id AS unidad_id, u.numero AS unidad_numero,
                    u.nombre AS unidad_nombre, u.estado AS unidad_estado, count(a.id) AS total_actividades,
                    count(ra.id) AS actividades_con_resultado,
                    round(COALESCE(sum((COALESCE(ra.calificacion, (0)::numeric) * (a.ponderacion / 100.0))), (0)::numeric), 4) AS promedio_parcial,
                    COALESCE(bu.monto, (0)::numeric) AS bonus_unidad,
                    round(LEAST((COALESCE(sum((COALESCE(ra.calificacion, (0)::numeric) * (a.ponderacion / 100.0))), (0)::numeric) + COALESCE(bu.monto, (0)::numeric)), g.calificacion_maxima), 4) AS resultado_estimado,
                    ru.resultado_final AS resultado_persistido
                   FROM academ.inscripcion i
                     JOIN academ.alumno al ON al.id = i.alumno_id
                     JOIN academ.grupo g ON g.id = i.grupo_id
                     JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                     JOIN academ.materia m ON m.id = pm.materia_id
                     JOIN academ.unidad u ON u.grupo_id = g.id
                     LEFT JOIN academ.actividad a ON a.unidad_id = u.id AND a.activa = true
                     LEFT JOIN academ.resultado_actividad ra ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
                     LEFT JOIN academ.bonus_unidad bu ON bu.inscripcion_id = i.id AND bu.unidad_id = u.id
                     LEFT JOIN academ.resultado_unidad ru ON ru.inscripcion_id = i.id AND ru.unidad_id = u.id
                  WHERE i.estado::text = 'ACTIVA'::text
                  GROUP BY i.id, al.matricula, al.nombre, al.apellido_pat, g.id, g.nombre, m.nombre, u.id, u.numero, u.nombre, u.estado, bu.monto, g.calificacion_maxima, ru.resultado_final;
            """)

            await conn.execute("""
                CREATE OR REPLACE VIEW academ.v_analitica_docente AS
                 WITH promedios_grupo AS (
                         SELECT g.id AS grupo_id, g.nombre AS grupo, g.docente_id, (((d.nombre)::text || ' '::text) || (d.apellido_pat)::text) AS docente,
                            m.id AS materia_id, m.nombre AS materia, p.codigo AS periodo, g.estado AS estado_grupo, count(i.id) AS total_alumnos,
                            round(avg(rm.resultado_final), 2) AS promedio_grupo,
                            count(rm.id) FILTER (WHERE (rm.resultado_final >= (70)::numeric)) AS aprobados,
                            count(rm.id) FILTER (WHERE (rm.resultado_final < (70)::numeric)) AS reprobados,
                            round(stddev(rm.resultado_final), 2) AS desviacion_estandar
                           FROM academ.grupo g
                             JOIN academ.docente d ON d.id = g.docente_id
                             JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                             JOIN academ.materia m ON m.id = pm.materia_id
                             JOIN academ.periodo_academico p ON p.id = g.periodo_id
                             JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado::text = 'ACTIVA'::text
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
                    round((pg.promedio_grupo - pmp.promedio_materia), 2) AS diferencia_vs_materia,
                        CASE
                            WHEN (pg.promedio_grupo > pmp.promedio_materia) THEN 'SOBRE_PROMEDIO'::text
                            WHEN (pg.promedio_grupo < pmp.promedio_materia) THEN 'BAJO_PROMEDIO'::text
                            ELSE 'EN_PROMEDIO'::text
                        END AS rendimiento_relativo,
                    round(((100.0 * (pg.aprobados)::numeric) / (NULLIF(pg.total_alumnos, 0))::numeric), 1) AS eficiencia_terminal_pct
                   FROM promedios_grupo pg
                     LEFT JOIN promedio_materia_periodo pmp ON pmp.materia_id = pg.materia_id AND pmp.periodo::text = pg.periodo::text;
            """)

            await conn.execute("""
                CREATE OR REPLACE VIEW academ.vw_mis_grupos AS
                 SELECT i.alumno_id, g.id AS grupo_id, g.nombre, g.estado, g.calificacion_maxima, m.nombre AS materia,
                    i.id AS inscripcion_id, i.estado AS estado_inscripcion, g.periodo_id,
                    (((d.nombre)::text || ' '::text) || (d.apellido_pat)::text) AS docente,
                    ( SELECT fn_calcular_resultado_materia.resultado_final
                           FROM academ.fn_calcular_resultado_materia(i.id) fn_calcular_resultado_materia(promedio_base, bonus_aplicado, resultado_calculado, resultado_final, unidades_totales, unidades_con_result)) AS resultado_final
                   FROM academ.inscripcion i
                     JOIN academ.grupo g ON g.id = i.grupo_id
                     JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                     JOIN academ.materia m ON m.id = pm.materia_id
                     JOIN academ.docente d ON d.id = g.docente_id;
            """)

            await conn.execute("""
                CREATE OR REPLACE VIEW academ.v_actividades_alumno AS
                 SELECT i.alumno_id, i.id AS inscripcion_id, g.id AS grupo_id, g.nombre AS grupo, m.nombre AS materia, u.id AS unidad_id, u.numero AS unidad_numero, u.nombre AS unidad_nombre, u.estado AS unidad_estado, a.id AS actividad_id,
                    a.tipo::text AS tipo_actividad, a.descripcion, a.ponderacion, a.orden, a.fecha_apertura, a.fecha_cierre,
                        CASE
                            WHEN ((a.fecha_apertura IS NULL) OR (now() >= a.fecha_apertura)) THEN true
                            ELSE false
                        END AS visible,
                        CASE
                            WHEN (a.fecha_cierre IS NULL) THEN 'ABIERTA'::text
                            WHEN (now() > a.fecha_cierre) THEN 'CERRADA'::text
                            ELSE 'EN_PLAZO'::text
                        END AS estatus_plazo,
                    ra.calificacion, ra.estado_entrega, ra.fecha_registro, ra.fecha_modificacion
                   FROM academ.inscripcion i
                     JOIN academ.grupo g ON g.id = i.grupo_id
                     JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                     JOIN academ.materia m ON m.id = pm.materia_id
                     JOIN academ.unidad u ON u.grupo_id = g.id
                     JOIN academ.actividad a ON a.unidad_id = u.id AND a.activa = true
                     LEFT JOIN academ.resultado_actividad ra ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
                  WHERE i.estado::text = 'ACTIVA'::text
                  ORDER BY u.numero, a.orden;
            """)

            await conn.execute("""
                CREATE OR REPLACE VIEW academ.v_analitica_alumno AS
                 WITH resultados_grupo AS (
                         SELECT i_1.alumno_id, i_1.grupo_id, i_1.id AS inscripcion_id, rm.resultado_final,
                            avg(rm.resultado_final) OVER (PARTITION BY i_1.grupo_id) AS promedio_grupo,
                            stddev(rm.resultado_final) OVER (PARTITION BY i_1.grupo_id) AS desviacion_grupo,
                            count(*) OVER (PARTITION BY i_1.grupo_id) AS total_alumnos,
                            rank() OVER (PARTITION BY i_1.grupo_id ORDER BY rm.resultado_final DESC) AS posicion_grupo,
                            percent_rank() OVER (PARTITION BY i_1.grupo_id ORDER BY rm.resultado_final) AS percentil_ascendente
                           FROM academ.inscripcion i_1
                             JOIN academ.resultado_materia rm ON rm.inscripcion_id = i_1.id
                          WHERE i_1.estado::text = 'ACTIVA'::text
                        )
                 SELECT rg.alumno_id, al.matricula, (((al.nombre)::text || ' '::text) || (al.apellido_pat)::text) AS alumno, m.nombre AS materia, g.nombre AS grupo, p.codigo AS periodo, rg.inscripcion_id,
                    round(rg.resultado_final::numeric, 2) AS resultado_final,
                    round(rg.promedio_grupo, 2) AS promedio_grupo,
                    round((rg.resultado_final - rg.promedio_grupo), 2) AS diferencia_vs_media,
                        CASE
                            WHEN (rg.resultado_final > rg.promedio_grupo) THEN 'SOBRE_MEDIA'::text
                            WHEN (rg.resultado_final < rg.promedio_grupo) THEN 'BAJO_MEDIA'::text
                            ELSE 'EN_MEDIA'::text
                        END AS posicion_relativa,
                    rg.posicion_grupo, rg.total_alumnos,
                    (round((((1)::double precision - rg.percentil_ascendente) * (100)::double precision)))::integer AS percentil_superior,
                        CASE
                            WHEN (rg.resultado_final >= (70)::numeric) THEN 'APROBADO'::text
                            ELSE 'REPROBADO'::text
                        END AS estatus
                   FROM resultados_grupo rg
                     JOIN academ.alumno al ON al.id = rg.alumno_id
                     JOIN academ.inscripcion i ON i.id = rg.inscripcion_id
                     JOIN academ.grupo g ON g.id = rg.grupo_id
                     JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                     JOIN academ.materia m ON m.id = pm.materia_id
                     JOIN academ.periodo_academico p ON p.id = g.periodo_id;
            """)

            print("5. Añadiendo restricción posicional a plan_materia...")
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
    asyncio.run(migrate_with_views())
