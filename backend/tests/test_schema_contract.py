import unittest

from scripts.verificar_esquema import (
    CAPACIDADES_OPCIONALES,
    EstadoEsquema,
    RUTINAS_REQUERIDAS,
    TABLAS_REQUERIDAS,
    VISTAS_REQUERIDAS,
    detectar_capacidades_no_disponibles,
    detectar_faltantes,
)


class SchemaContractTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
