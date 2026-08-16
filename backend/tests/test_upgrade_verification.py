import os
import unittest
from unittest.mock import patch

from scripts.verificar_actualizacion import (
    argumentos_conexion,
    entorno_postgresql,
    ruta_respaldo,
)


class UpgradeVerificationSafetyTests(unittest.TestCase):
    VARIABLES = {
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_NAME": "acadex",
        "DB_USER": "usuario",
        "DB_PASSWORD": "secreto-no-real",
    }

    def test_password_is_passed_only_through_process_environment(self):
        with patch.dict(os.environ, self.VARIABLES, clear=False):
            argumentos = argumentos_conexion("acadex")
            entorno = entorno_postgresql()

        self.assertNotIn(self.VARIABLES["DB_PASSWORD"], argumentos)
        self.assertEqual(entorno["PGPASSWORD"], self.VARIABLES["DB_PASSWORD"])

    def test_backup_path_is_unique_and_stays_in_backup_directory(self):
        primera = ruta_respaldo()
        segunda = ruta_respaldo()

        self.assertEqual(primera.parent.name, "backups")
        self.assertTrue(primera.name.startswith("acadex_pre_upgrade_"))
        self.assertEqual(primera.suffix, ".dump")
        self.assertNotEqual(primera, segunda)


if __name__ == "__main__":
    unittest.main()
