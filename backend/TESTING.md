# Backend tests

The backend regression suite uses Python's standard `unittest` runner. It covers
authentication, resource authorization, atomic grade updates, migration safety,
schema contracts, and API error handling without requiring a live database.

## Setup

Use Python 3.12 from the `backend` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

On macOS or Linux, activate the environment with:

```bash
source .venv/bin/activate
```

## Run the regression suite

From `backend`, execute the complete suite with one command:

```powershell
python -m scripts.ejecutar_pruebas
```

The runner applies isolated test settings before discovering or importing test
modules. Unit and transaction tests use fake connections, so this command does
not connect to PostgreSQL or modify academic data.

Database installation and upgrade checks are separate because they require a
configured PostgreSQL server. Their commands and safety constraints are
documented in `migrations/README.md`.
