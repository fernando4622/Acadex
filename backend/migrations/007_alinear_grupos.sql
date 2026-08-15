-- Alinea grupos con la relación curricular vigente plan_materia.

ALTER TABLE academ.grupo
    ADD COLUMN IF NOT EXISTS plan_materia_id INT,
    ADD COLUMN IF NOT EXISTS letra_grupo VARCHAR(5);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'academ'
          AND table_name = 'grupo'
          AND column_name = 'materia_id'
    ) THEN
        EXECUTE $migracion$
            WITH materias_con_plan_unico AS (
                SELECT materia_id, MIN(id) AS plan_materia_id
                FROM academ.plan_materia
                GROUP BY materia_id
                HAVING COUNT(*) = 1
            )
            UPDATE academ.grupo g
            SET plan_materia_id = unico.plan_materia_id
            FROM materias_con_plan_unico unico
            WHERE g.plan_materia_id IS NULL
              AND g.materia_id = unico.materia_id
        $migracion$;
    END IF;
END;
$$;

DO $$
DECLARE
    grupos_sin_plan INT;
BEGIN
    SELECT COUNT(*) INTO grupos_sin_plan
    FROM academ.grupo
    WHERE plan_materia_id IS NULL;

    IF grupos_sin_plan > 0 THEN
        RAISE EXCEPTION
            'No se puede completar la migración: % grupo(s) no tienen una asignación única en plan_materia',
            grupos_sin_plan;
    END IF;
END;
$$;

ALTER TABLE academ.grupo
    ALTER COLUMN plan_materia_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'academ.grupo'::regclass
          AND conname = 'fk_grupo_plan_materia'
    ) THEN
        ALTER TABLE academ.grupo
            ADD CONSTRAINT fk_grupo_plan_materia
            FOREIGN KEY (plan_materia_id) REFERENCES academ.plan_materia(id);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_grupo_plan_materia
    ON academ.grupo(plan_materia_id);

COMMENT ON COLUMN academ.grupo.plan_materia_id IS
    'Materia contextualizada dentro del plan de estudios que imparte el grupo.';
