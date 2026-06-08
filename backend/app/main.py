"""
Punto de entrada de la aplicación.

Registra todos los routers, configura el pool de BD,
añade CORS para que el frontend pueda consumir la API,
y define los manejadores globales de errores.
"""
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
from app.database import get_pool, close_pool
from app.errors import handle_pg_error

# ── Routers ───────────────────────────────────────────────────────────────────
from app.auth.router        import router as auth_router
from app.routers.alumnos    import router as alumnos_router
from app.routers.catalogos  import router as catalogos_router
from app.routers.grupos     import router as grupos_router
from app.routers.inscripciones import router as inscripciones_router
from app.routers.unidades   import router as unidades_router
from app.routers.actividades import router as actividades_router
from app.routers.calificaciones import router as calificaciones_router
from app.routers.bonus      import router as bonus_router
from app.routers.resultados import router as resultados_router
from app.routers.importacion import router as importacion_router
from app.routers.dashboard import router as dashboard_router
from app.routers.auditoria import router as auditoria_router
from app.routers.periodos   import router as periodos_router
from app.routers.docentes   import router as docentes_router
from app.routers.entregas   import router as entregas_router
from app.routers.analytics  import router as analytics_router
from app.routers.notificaciones import router as notificaciones_router
from app.routers.reportes      import router as reportes_router
from app.routers.administracion import router as administracion_router


# ── Ciclo de vida ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: inicializar el pool de conexiones
    await get_pool()
    yield
    # Shutdown: cerrar el pool limpiamente
    await close_pool()


# ── Aplicación ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Sistema de Registro y Cálculo de Resultados Académicos",
    description="""
## API REST para gestión académica

### Flujo obligatorio
1. **Carreras** y **Aulas** → Definir infraestructura base
2. **Materias** → Definir catálogo con unidades plantilla
3. **Planes de Estudio** → Vincular materias a carreras y semestres
4. **Periodos** y **Docentes** → Preparar ciclo escolar
5. **Grupos** → Crear secciones vinculando materia, docente y periodo
6. **Inscripciones** → Registrar alumnos en grupos

### Evaluación
1. **Actividades** → Docente crea tareas/exámenes por unidad
2. **Calificaciones** → Registrar puntajes
3. **Publicación** → Publicar calificaciones para visibilidad del alumno
4. **Captura** → Alumno puede subir evidencias (si se habilita)
5. **Cierre** → Cerrar unidades (persiste snapshots de resultados)
6. **Bonus** → Aplicar puntos extra por unidad o materia (opcional)
7. **Finalización** → Finalizar materia (calcula resultado final)

### Roles
- **ADMIN** — acceso total
- **DOCENTE** — solo sus grupos
- **ALUMNO** — solo lectura de sus propios datos
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # En producción: especificar dominio del frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Manejador global de errores de PostgreSQL ─────────────────────────────────
@app.exception_handler(asyncpg.PostgresError)
async def postgres_error_handler(request: Request, exc: asyncpg.PostgresError):
    """
    Captura cualquier error de PostgreSQL que no haya sido manejado
    dentro del endpoint y lo convierte en una respuesta HTTP legible.
    """
    http_exc = handle_pg_error(exc)
    return JSONResponse(status_code=http_exc.status_code, content={"detail": http_exc.detail})


# ── Registro de routers ───────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(alumnos_router)
app.include_router(catalogos_router)
app.include_router(grupos_router)
app.include_router(inscripciones_router)
app.include_router(unidades_router)
app.include_router(actividades_router)
app.include_router(calificaciones_router)
app.include_router(bonus_router)
app.include_router(resultados_router)
app.include_router(importacion_router)
app.include_router(dashboard_router)
app.include_router(auditoria_router)
app.include_router(periodos_router)
app.include_router(docentes_router)
app.include_router(entregas_router)
app.include_router(analytics_router)
app.include_router(notificaciones_router)
app.include_router(reportes_router)
app.include_router(administracion_router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Sistema"], include_in_schema=False)
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}
