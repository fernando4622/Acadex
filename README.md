# ACADEX - Sistema de Control de Calificaciones

ACADEX es un **Sistema de Control de Calificaciones Institucional** diseñado para automatizar el cálculo de calificaciones, estructurar el control de catálogos (carreras, materias, planes de estudio), manejar periodos académicos y generar reportes analíticos para docentes, alumnos y personal administrativo. Todo esto, asegurando la trazabilidad a través de un estricto log de auditoría inmutable.

## Tecnologías y Herramientas

El proyecto está construido bajo una arquitectura Cliente-Servidor separando el Frontend y el Backend:

### **Frontend (Interfaz de Usuario)**
- **React 18** + **Vite**: Para una experiencia de Single Page Application (SPA) ultrarrápida.
- **Tailwind CSS**: Estilos modernos y responsivos con efecto glassmorphism.
- **React Router DOM**: Navegación fluida.
- **Axios**: Comunicación HTTP eficiente con interceptores para JWT.
- **Recharts / Nivo**: Visualización de datos y analítica en dashboards.

### **Backend (API y Lógica)**
- **Python 3.10+** + **FastAPI**: Backend robusto, asíncrono y de alto rendimiento.
- **asyncpg**: Driver de conexión a base de datos de ultrabajo nivel y máxima velocidad.
- **JWT + bcrypt**: Autenticación segura y manejo de sesiones.

### **Base de Datos**
- **PostgreSQL 17+**: Base de datos relacional avanzada. Toda la lógica dura de recálculo en cascada y seguridad inmutable está escrita directamente en **PL/pgSQL** (Triggers y Stored Procedures).

---

## Requisitos Previos

Antes de instalar el proyecto, asegúrate de tener instalado en tu sistema:
- [Node.js](https://nodejs.org/es/) (v18 o superior)
- [Python](https://www.python.org/downloads/) (v3.10 o superior)
- [PostgreSQL](https://www.postgresql.org/download/) (v17 o superior)
- [Git](https://git-scm.com/)

---

## Guía de Instalación y Configuración Local

Sigue estos pasos para arrancar el proyecto en tu computadora en pocos minutos.

### 1. Clonar el Repositorio
Abre tu terminal y ejecuta:
```bash
git clone https://github.com/fernando4622/Acadex
cd "Sistema Calificaciones"
```

### 2. Configurar la Base de Datos (PostgreSQL)
El sistema requiere que primero levantes el esquema de la base de datos `academ` y los stored procedures.
1. Abre tu herramienta de gestión de Postgres (pgAdmin, DBeaver o psql).
2. Crea una base de datos, por ejemplo: `calificaciones_db`.
3. Ejecuta el archivo de respaldo o el script SQL principal que se encuentra en la carpeta `bd/database.sql` para generar la estructura de tablas y las funciones.

### 3. Configurar e Iniciar el Backend (FastAPI)

Abre una terminal nueva y dirígete a la carpeta del backend:
```bash
cd backend
```

**Crear entorno virtual (opcional pero recomendado):**
```bash
python -m venv venv
# En Windows:
venv\Scripts\activate
# En Mac/Linux:
source venv/bin/activate
```

**Instalar dependencias:**
```bash
pip install -r requirements.txt
```

**Configurar variables de entorno:**
1. Copia el archivo `.env.example` y renómbralo a `.env`.
2. Ajusta las credenciales de tu base de datos:
```ini
# backend/.env
DATABASE_URL=postgres://usuario:contraseña@localhost:5432/calificaciones_db
SECRET_KEY=tu_clave_secreta_super_segura
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

**Ejecutar el servidor de desarrollo:**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
> La API estará corriendo en `http://localhost:8000`
> Puedes ver la documentación interactiva generada en `http://localhost:8000/docs`

### 4. Configurar e Iniciar el Frontend (React)

Abre otra terminal y dirígete a la carpeta del frontend:
```bash
cd frontend
```

**Instalar dependencias de Node:**
```bash
npm install
```

**Ejecutar la aplicación React:**
```bash
npm run dev
```
> La interfaz gráfica se abrirá en tu navegador en `http://localhost:5173`

---

## Credenciales de Acceso por Defecto
Una vez que el sistema esté corriendo y tengas datos insertados, puedes entrar con las siguientes credenciales de prueba que hayas preconfigurado en tu base de datos.
- **URL de Ingreso**: `http://localhost:5173/`

*(Nota: Asegúrate de insertar un usuario `ADMIN` base directamente en la tabla `academ.usuario` para configurar el sistema por primera vez).*

---

## Estructura del Proyecto

```text
Sistema Calificaciones/
├── backend/                  # Servidor y API (FastAPI)
│   ├── app/
│   │   ├── auth/             # Módulo JWT
│   │   ├── routers/          # Endpoints y Rutas (146 endpoints)
│   │   ├── schemas/          # Modelos de validación (Pydantic)
│   │   ├── database.py       # Conexión asyncpg
│   │   └── main.py           # Punto de entrada de la API
│   ├── requirements.txt      # Dependencias Python
│   └── .env                  # Variables del servidor
├── frontend/                 # Aplicación Web (React)
│   ├── src/
│   │   ├── api/              # Llamadas a Axios
│   │   ├── components/       # UI Reutilizable
│   │   ├── context/          # Estado global (Autenticación)
│   │   └── pages/            # Vistas principales (Login, Dashboard, etc.)
│   ├── package.json          # Dependencias Node
│   └── vite.config.js        # Configuración del bundler
└── bd/
    └── database.sql          # Script SQL para estructurar la DB
```

---

## Equipo de Desarrollo
**González Cruz Fernando Said** - Desarrollador Backend y Diseñador de Base de Datos
**Pérez Santos Vanessa** - Desarrollador Backend y Diseñador de Base de Datos
**Valenzuela Aguirre Ana Fernanda** - Diseñadora de Base de Datos
