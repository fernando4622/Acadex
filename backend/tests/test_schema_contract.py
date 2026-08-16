import unittest
from pathlib import Path

from scripts.verificar_esquema import (
    CAPACIDADES_OPCIONALES,
    COLUMNAS_REQUERIDAS,
    EstadoEsquema,
    RUTINAS_REQUERIDAS,
    TABLAS_REQUERIDAS,
    VISTAS_REQUERIDAS,
    detectar_capacidades_no_disponibles,
    detectar_columnas_faltantes,
    detectar_faltantes,
    fuentes_bootstrap,
    leer_estado_fuentes_sql,
)


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent


class SchemaContractTests(unittest.TestCase):
    def test_routine_contract_uses_current_control_generator_name(self):
        self.assertIn("fn_generar_no_control", RUTINAS_REQUERIDAS)
        self.assertNotIn("fn_generar_num_control", RUTINAS_REQUERIDAS)

    def test_column_contract_uses_current_domain_names(self):
        self.assertIn("no_control", COLUMNAS_REQUERIDAS["alumno"])
        self.assertNotIn("matricula", COLUMNAS_REQUERIDAS["alumno"])
        self.assertIn("plan_materia_id", COLUMNAS_REQUERIDAS["grupo"])
        self.assertNotIn("materia_id", COLUMNAS_REQUERIDAS["grupo"])
        self.assertIn("estado", COLUMNAS_REQUERIDAS["periodo_academico"])
        self.assertNotIn("activo", COLUMNAS_REQUERIDAS["periodo_academico"])
        self.assertIn("tipo_catalogo_id", COLUMNAS_REQUERIDAS["actividad"])
        self.assertNotIn("tipo", COLUMNAS_REQUERIDAS["actividad"])

    def test_current_column_contract_has_no_missing_columns(self):
        estado = EstadoEsquema(
            tablas=set(TABLAS_REQUERIDAS),
            rutinas=set(RUTINAS_REQUERIDAS),
            vistas=set(VISTAS_REQUERIDAS),
            columnas={tabla: set(columnas) for tabla, columnas in COLUMNAS_REQUERIDAS.items()},
        )

        self.assertEqual(detectar_columnas_faltantes(estado), {})

    def test_legacy_column_names_do_not_satisfy_current_contract(self):
        columnas = {tabla: set(nombres) for tabla, nombres in COLUMNAS_REQUERIDAS.items()}
        columnas["alumno"] = columnas["alumno"] - {"no_control"} | {"matricula"}
        columnas["grupo"] = columnas["grupo"] - {"plan_materia_id"} | {"materia_id"}
        columnas["periodo_academico"] = columnas["periodo_academico"] - {"estado"} | {"activo"}
        columnas["actividad"] = columnas["actividad"] - {"tipo_catalogo_id"} | {"tipo"}
        estado = EstadoEsquema(set(), set(), set(), columnas)

        faltantes = detectar_columnas_faltantes(estado)

        self.assertEqual(faltantes["alumno"], ["no_control"])
        self.assertEqual(faltantes["grupo"], ["plan_materia_id"])
        self.assertEqual(faltantes["periodo_academico"], ["estado"])
        self.assertEqual(faltantes["actividad"], ["tipo_catalogo_id"])

    def test_complete_schema_has_no_missing_objects(self):
        estado = EstadoEsquema(
            tablas=set(TABLAS_REQUERIDAS),
            rutinas=set(RUTINAS_REQUERIDAS),
            vistas=set(VISTAS_REQUERIDAS),
        )

        self.assertEqual(
            detectar_faltantes(estado),
            {"tablas": [], "rutinas": [], "vistas": []},
        )

    def test_missing_objects_are_grouped_and_sorted(self):
        estado = EstadoEsquema(
            tablas=TABLAS_REQUERIDAS - {"resultado_unidad", "bonus_materia"},
            rutinas=RUTINAS_REQUERIDAS - {"sp_activar_periodo"},
            vistas=VISTAS_REQUERIDAS - {"v_auditoria"},
        )

        self.assertEqual(
            detectar_faltantes(estado),
            {
                "tablas": ["bonus_materia", "resultado_unidad"],
                "rutinas": ["sp_activar_periodo"],
                "vistas": ["v_auditoria"],
            },
        )

    def test_optional_capabilities_do_not_fail_the_core_contract(self):
        estado = EstadoEsquema(
            tablas=set(TABLAS_REQUERIDAS),
            rutinas=set(RUTINAS_REQUERIDAS),
            vistas=set(VISTAS_REQUERIDAS),
        )

        self.assertEqual(detectar_faltantes(estado)["tablas"], [])
        self.assertEqual(
            detectar_capacidades_no_disponibles(estado),
            CAPACIDADES_OPCIONALES,
        )

    def test_available_optional_capability_is_not_reported(self):
        estado = EstadoEsquema(
            tablas=set(TABLAS_REQUERIDAS) | {"horario_grupo"},
            rutinas=set(RUTINAS_REQUERIDAS),
            vistas=set(VISTAS_REQUERIDAS),
        )

        faltantes = detectar_capacidades_no_disponibles(estado)

        self.assertNotIn("horario_grupo", faltantes)

    def test_extracts_objects_from_qualified_and_unqualified_sql(self):
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "esquema.sql"
            source.write_text(
                """
                CREATE TABLE academ.alumno (id UUID);
                CREATE TABLE IF NOT EXISTS materia (id INT);
                CREATE OR REPLACE FUNCTION academ.fn_prueba() RETURNS INT AS $$
                BEGIN RETURN 1; END;
                $$ LANGUAGE plpgsql;
                CREATE PROCEDURE sp_prueba() LANGUAGE SQL AS $$ SELECT 1 $$;
                CREATE OR REPLACE VIEW academ.v_prueba AS SELECT 1;
                -- CREATE TABLE academ.no_debe_contar (id INT);
                """,
                encoding="utf-8",
            )

            estado = leer_estado_fuentes_sql([source])

        self.assertEqual(estado.tablas, {"alumno", "materia"})
        self.assertEqual(estado.rutinas, {"fn_prueba", "sp_prueba"})
        self.assertEqual(estado.vistas, {"v_prueba"})
        self.assertEqual(estado.columnas["alumno"], {"id"})
        self.assertEqual(estado.columnas["materia"], {"id"})

    def test_extracts_the_final_name_of_a_renamed_routine(self):
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "renombrar.sql"
            source.write_text(
                """
                CREATE FUNCTION academ.fn_anterior() RETURNS INT
                LANGUAGE SQL AS $$ SELECT 1 $$;
                ALTER FUNCTION academ.fn_anterior()
                    RENAME TO fn_vigente;
                """,
                encoding="utf-8",
            )

            estado = leer_estado_fuentes_sql([source])

        self.assertIn("fn_vigente", estado.rutinas)
        self.assertNotIn("fn_anterior", estado.rutinas)

    def test_current_bootstrap_drift_is_explicit(self):
        fuentes = fuentes_bootstrap(
            PROJECT_ROOT / "bd" / "database.sql",
            BACKEND_ROOT / "migrations",
        )

        faltantes = detectar_faltantes(leer_estado_fuentes_sql(fuentes))

        self.assertEqual(
            faltantes,
            {
                "tablas": [],
                "rutinas": [],
                "vistas": [],
            },
        )

        columnas_faltantes = detectar_columnas_faltantes(
            leer_estado_fuentes_sql(fuentes)
        )
        self.assertEqual(columnas_faltantes, {})


if __name__ == "__main__":
    unittest.main()
