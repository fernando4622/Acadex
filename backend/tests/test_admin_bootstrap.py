import unittest
from pathlib import Path

from scripts.crear_administrador import validar_password


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
KNOWN_PASSWORD = "Admin" + "1234!"
KNOWN_HASH_FINGERPRINTS = (
    "6ece4297bbf4616cccaf35ebae9c034c",
    "5ab87e554306caba87ec84f268c74365",
)


class PasswordPolicyTests(unittest.TestCase):
    def test_strong_password_is_accepted(self):
        self.assertEqual(validar_password("UnaClaveSegura-2026"), [])

    def test_weak_password_reports_all_missing_requirements(self):
        errores = validar_password("abc")

        self.assertEqual(len(errores), 4)


class BootstrapSeedTests(unittest.TestCase):
    def test_bootstrap_sources_do_not_create_known_credentials(self):
        sources = (
            BACKEND_ROOT / "migrations" / "001_usuarios.sql",
            PROJECT_ROOT / "bd" / "003_expansion.sql",
            PROJECT_ROOT / "bd" / "database.sql",
        )

        for source in sources:
            content = source.read_text(encoding="utf-8")
            self.assertNotIn(KNOWN_PASSWORD, content, source)
            self.assertNotIn("$2b$12$", content, source)

    def test_remediation_migration_targets_known_hashes(self):
        migration = (
            BACKEND_ROOT
            / "migrations"
            / "003_desactivar_credenciales_predeterminadas.sql"
        ).read_text(encoding="utf-8")

        for fingerprint in KNOWN_HASH_FINGERPRINTS:
            self.assertIn(fingerprint, migration)
        self.assertIn("MD5(password_hash)", migration)
        self.assertIn("activo = FALSE", migration)


if __name__ == "__main__":
    unittest.main()
