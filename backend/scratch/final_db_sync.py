import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def run_final_fix():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    try:
        async with conn.transaction():
            print("Sincronizando esquema de vistas y funciones...")
            
            # 1. Función de cálculo mejorada (manejo de NULL)
            await conn.execute("""
                CREATE OR REPLACE FUNCTION academ.fn_calcular_resultado_materia(p_inscripcion_id uuid)
                 RETURNS TABLE(promedio_base numeric, bonus_aplicado numeric, resultado_calculado numeric, resultado_final numeric, unidades_totales integer, unidades_con_result integer)
                 LANGUAGE plpgsql
                AS $function$
                DECLARE
                    v_cal_max         NUMERIC(6,3);
                    v_bonus_mat       NUMERIC(6,3) := 0;
                    v_promedio_base   NUMERIC(8,4);
                    v_calculado       NUMERIC(8,4);
                    v_override        NUMERIC(6,3);
                    v_final           NUMERIC(8,4);
                    v_total_unidades  INT;
                    v_unid_con_result INT;
                BEGIN
                    SELECT g.calificacion_maxima INTO v_cal_max FROM academ.inscripcion i JOIN academ.grupo g ON g.id = i.grupo_id WHERE i.id = p_inscripcion_id;
                    SELECT COUNT(*) INTO v_total_unidades FROM academ.unidad u JOIN academ.inscripcion i ON i.grupo_id = u.grupo_id WHERE i.id = p_inscripcion_id;
                    
                    SELECT COUNT(ru.id), AVG(ru.resultado_final)
                    INTO v_unid_con_result, v_promedio_base
                    FROM academ.unidad u
                    JOIN academ.inscripcion i ON i.grupo_id = u.grupo_id
                    LEFT JOIN academ.resultado_unidad ru ON ru.unidad_id = u.id AND ru.inscripcion_id = p_inscripcion_id
                    WHERE i.id = p_inscripcion_id;

                    IF v_unid_con_result = 0 THEN
                        v_promedio_base := NULL; v_calculado := NULL; v_final := NULL;
                    ELSE
                        SELECT COALESCE(monto, 0) INTO v_bonus_mat FROM academ.bonus_materia WHERE inscripcion_id = p_inscripcion_id;
                        v_bonus_mat := COALESCE(v_bonus_mat, 0);
                        v_calculado := LEAST(v_promedio_base + v_bonus_mat, v_cal_max);
                        SELECT resultado_override INTO v_override FROM academ.resultado_materia WHERE inscripcion_id = p_inscripcion_id;
                        v_final := CASE WHEN v_override IS NOT NULL THEN LEAST(v_override::NUMERIC(8,4), v_cal_max) ELSE v_calculado END;
                    END IF;

                    RETURN QUERY SELECT v_promedio_base, COALESCE(v_bonus_mat, 0)::NUMERIC, v_calculado, v_final, v_total_unidades, v_unid_con_result;
                END;
                $function$;
            """)

            # 2. Vista vw_mis_grupos (corregida con plan_materia_id)
            await conn.execute("DROP VIEW IF EXISTS academ.vw_mis_grupos CASCADE;")
            await conn.execute("""
                CREATE OR REPLACE VIEW academ.vw_mis_grupos AS
                SELECT i.alumno_id, g.id AS grupo_id, g.nombre, g.estado, g.calificacion_maxima, m.nombre AS materia,
                    i.id AS inscripcion_id, i.estado AS estado_inscripcion, g.periodo_id,
                    d.nombre || ' ' || d.apellido_pat AS docente,
                    (SELECT resultado_final FROM academ.fn_calcular_resultado_materia(i.id)) AS resultado_final
                FROM academ.inscripcion i
                JOIN academ.grupo g ON g.id = i.grupo_id
                JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                JOIN academ.materia m ON m.id = pm.materia_id
                JOIN academ.docente d ON d.id = g.docente_id;
            """)

            # 3. Vista v_actividades_alumno
            await conn.execute("DROP VIEW IF EXISTS academ.v_actividades_alumno CASCADE;")
            await conn.execute("""
                CREATE OR REPLACE VIEW academ.v_actividades_alumno AS
                SELECT i.alumno_id, i.id AS inscripcion_id, g.id AS grupo_id, g.nombre AS grupo, m.nombre AS materia, u.id AS unidad_id, u.numero AS unidad_numero, u.nombre AS unidad_nombre, u.estado AS unidad_estado, a.id AS actividad_id,
                    a.tipo::text AS tipo_actividad, a.descripcion, a.ponderacion, a.orden, a.fecha_apertura, a.fecha_cierre,
                    CASE WHEN (a.fecha_apertura IS NULL OR now() >= a.fecha_apertura) THEN true ELSE false END AS visible,
                    CASE WHEN a.fecha_cierre IS NULL THEN 'ABIERTA' WHEN now() > a.fecha_cierre THEN 'CERRADA' ELSE 'EN_PLAZO' END AS estatus_plazo,
                    ra.calificacion, ra.estado_entrega, ra.fecha_registro, ra.fecha_modificacion
                FROM academ.inscripcion i
                JOIN academ.grupo g ON g.id = i.grupo_id
                JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
                JOIN academ.materia m ON m.id = pm.materia_id
                JOIN academ.unidad u ON u.grupo_id = g.id
                JOIN academ.actividad a ON a.unidad_id = u.id AND a.activa = true
                LEFT JOIN academ.resultado_actividad ra ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
                WHERE i.estado = 'ACTIVA';
            """)

            print("¡Mantenimiento de BD completado exitosamente!")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run_final_fix())
