import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def update_function():
    conn = await asyncpg.connect(
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    try:
        async with conn.transaction():
            print("Actualizando fn_calcular_resultado_materia...")
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
                    -- Escala máxima
                    SELECT g.calificacion_maxima
                    INTO   v_cal_max
                    FROM   academ.inscripcion i
                    JOIN   academ.grupo       g ON g.id = i.grupo_id
                    WHERE  i.id = p_inscripcion_id;

                    -- Total de unidades del grupo
                    SELECT COUNT(*)
                    INTO   v_total_unidades
                    FROM   academ.unidad u
                    JOIN   academ.inscripcion i ON i.grupo_id = u.grupo_id
                    WHERE  i.id = p_inscripcion_id;

                    -- Promedio de unidades
                    SELECT COUNT(ru.id),
                           AVG(ru.resultado_final)
                    INTO   v_unid_con_result, v_promedio_base
                    FROM   academ.unidad u
                    JOIN   academ.inscripcion i ON i.grupo_id = u.grupo_id
                    LEFT JOIN academ.resultado_unidad ru
                           ON ru.unidad_id      = u.id
                          AND ru.inscripcion_id = p_inscripcion_id
                    WHERE  i.id = p_inscripcion_id;

                    -- Si no hay unidades con resultado, todo es NULL
                    IF v_unid_con_result = 0 THEN
                        v_promedio_base := NULL;
                        v_calculado := NULL;
                        v_final := NULL;
                    ELSE
                        -- Bonus de materia
                        SELECT COALESCE(monto, 0)
                        INTO   v_bonus_mat
                        FROM   academ.bonus_materia
                        WHERE  inscripcion_id = p_inscripcion_id;

                        v_bonus_mat := COALESCE(v_bonus_mat, 0);
                        v_calculado := LEAST(v_promedio_base + v_bonus_mat, v_cal_max);

                        -- Override del docente
                        SELECT resultado_override
                        INTO   v_override
                        FROM   academ.resultado_materia
                        WHERE  inscripcion_id = p_inscripcion_id;

                        v_final := CASE
                            WHEN v_override IS NOT NULL THEN LEAST(v_override::NUMERIC(8,4), v_cal_max)
                            ELSE v_calculado
                        END;
                    END IF;

                    RETURN QUERY SELECT
                        v_promedio_base, COALESCE(v_bonus_mat, 0)::NUMERIC, v_calculado, v_final,
                        v_total_unidades, v_unid_con_result;
                END;
                $function$;
            """)
            print("Función actualizada exitosamente.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(update_function())
