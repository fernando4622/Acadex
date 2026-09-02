"""Run the backend regression suite with isolated test settings."""

import os
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
TEST_SETTINGS = {
    "APP_ENV": "test",
    "DATABASE_URL": "",
    "DB_HOST": "database.invalid",
    "DB_PORT": "5432",
    "DB_NAME": "acadex_unit_tests",
    "DB_USER": "acadex_test_runner",
    "DB_PASSWORD": "not-used",
    "SECRET_KEY": "acadex-test-key-000000000000000000000000000000000000000000000000",
    "ALGORITHM": "HS256",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "60",
}


def configure_test_environment() -> None:
    os.environ.update(TEST_SETTINGS)


def discover_tests() -> unittest.TestSuite:
    return unittest.defaultTestLoader.discover(
        start_dir=str(BACKEND_ROOT / "tests"),
        pattern="test_*.py",
        top_level_dir=str(BACKEND_ROOT),
    )


def main() -> int:
    configure_test_environment()
    result = unittest.TextTestRunner(verbosity=2).run(discover_tests())
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
