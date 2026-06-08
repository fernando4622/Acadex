# ACADEX
## Documentación Completa del Sistema de Información

---

## 1. Visión General

**Nombre**: ACADEX  
**Versión**: 1.0.0  
**Motor BD**: PostgreSQL 17+/18 — Esquema Híbrido UUID/SERIAL  
**Backend**: FastAPI (Python) + asyncpg  
**Frontend**: React + Vite + TailwindCSS  
**Autenticación**: JWT (HS256) con RBAC multi-rol  

### 1.1 Propósito
Sistema integral para la gestión académica institucional que abarca desde el registro de catálogos (carreras, materias, planes de estudio) hasta el cálculo automatizado de calificaciones con auditoría completa. Diseñado como **mina de datos** para análisis institucional y toma de decisiones basada en evidencia.

### 1.2 Roles del Sistema

| Rol | Alcance | Módulos Accesibles |
|-----|---------|-------------------|
| **ADMIN** | Acceso total | Dashboard institucional, Catálogos, Planes, Periodos, Grupos, Alumnos, Docentes, Auditoría, Analytics, Reportes, Mapa de Riesgo |
| **DOCENTE** | Solo sus grupos | Dashboard docente, Mis Grupos, Calificaciones, Actividades, Bonus, Cierre de unidades, Pase de lista, Horario |
| **ALUMNO** | Solo lectura propia | Dashboard alumno, Mis Grupos, Mis Calificaciones, Entregas, Historial, Horario, Perfil |

---

## 2. Arquitectura de Capas

```
┌──────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)            │
│  24 páginas · TailwindCSS · Axios · React Router     │
├──────────────────────────────────────────────────────┤
│                    API REST (FastAPI)                 │
│  19 routers · JWT Auth · CORS · Error Handling       │
├──────────────────────────────────────────────────────┤
│              BASE DE DATOS (PostgreSQL 17+)           │
│  Esquema: academ · 15+ tablas · 10+ triggers         │
│  7+ funciones · 6+ stored procedures · 8+ vistas     │
└──────────────────────────────────────────────────────┘
```

### 2.1 Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **Frontend** | React 18 + Vite | SPA con hot reload, rendimiento óptimo |
| **Estilos** | TailwindCSS | Diseño premium glassmorphism, responsive |
| **HTTP Client** | Axios | Interceptores JWT, manejo centralizado |
| **Backend** | FastAPI + Uvicorn | Async nativo, OpenAPI auto-doc |
| **ORM/Driver** | asyncpg (raw SQL) | Máximo control, rendimiento directo |
| **Auth** | JWT + bcrypt | Stateless, seguro, configurable |
| **BD** | PostgreSQL 17+ | UUIDv7, RLS, JSONB, funciones PL/pgSQL |

### 2.2 Estrategia de Identificadores

| Tipo | Tablas | Razón |
|------|--------|-------|
| **UUID (v7)** | alumno, docente, grupo, inscripcion, usuario | Seguridad en APIs públicas, no enumerables |
| **SERIAL (INT)** | periodo, materia, unidad, actividad, resultados, bonus | Eficiencia en JOINs internos, secuenciales |
| **TEXT** | auditoria_log.registro_id | Polimorfismo UUID/INT |

---

## 3. Modelo de Datos — Diagrama Entidad-Relación

```
periodo_academico ──┐
                    ├──▶ grupo ◀── docente
materia ───────────┘       │          │
                           │          └──▶ usuario ◀── rol
                    unidad ◀┘                │
                      │              usuario_rol
               actividad
                      │
inscripcion ──────────┤
  (alumno ↔ grupo)    │
                resultado_actividad
                      │
              resultado_unidad (snapshot)
                      │
              resultado_materia (snapshot)
                      │
         bonus_unidad / bonus_materia
                      │
              auditoria_log (inmutable)
```

---

## 4. Catálogo de Tablas

### Sección A — Catálogos Base
| Tabla | PK | Descripción |
|-------|-----|------------|
| `periodo_academico` | SERIAL | Semestres/cuatrimestres con fechas y estado activo |
| `alumno` | UUID | Catálogo de alumnos (matrícula, nombre, email) |
| `docente` | UUID | Catálogo de docentes (num_empleado, nombre, email) |
| `materia` | SERIAL | Catálogo de asignaturas (clave, nombre, créditos) |
| `carrera` | SERIAL | Programas académicos |
| `plan_estudio` | SERIAL | Planes de estudio por carrera |
| `plan_materia` | SERIAL | Vinculación materia-plan con semestre y orden |
| `aula` | SERIAL | Espacios físicos con capacidad |

### Sección B — Estructura Académica
| Tabla | PK | Descripción |
|-------|-----|------------|
| `grupo` | UUID | Instancia de materia en un periodo (docente, horario, estado) |
| `unidad` | SERIAL | Unidades temáticas por grupo (estado: EDICION→CERRADA→FINALIZADA) |
| `unidad_plantilla` | SERIAL | Plantillas reutilizables de unidades por materia |
| `actividad` | SERIAL | Evaluaciones por unidad (tipo ENUM, ponderación, fechas) |
| `horario_grupo` | SERIAL | Horarios detallados por día/aula |

### Sección C — Inscripciones y Resultados
| Tabla | PK | Descripción |
|-------|-----|------------|
| `inscripcion` | UUID | Relación alumno↔grupo con estado (ACTIVA/BAJA) |
| `resultado_actividad` | SERIAL | Calificación por alumno por actividad |
| `resultado_unidad` | SERIAL | Snapshot persistido al cerrar unidad (promedio + bonus) |
| `resultado_materia` | SERIAL | Snapshot final de materia (con override opcional) |
| `bonus_unidad` | SERIAL | Puntos extra por unidad por alumno |
| `bonus_materia` | SERIAL | Puntos extra a nivel materia |

### Sección D — Seguridad y Auditoría
| Tabla | PK | Descripción |
|-------|-----|------------|
| `usuario` | UUID | Identidad de acceso (email + bcrypt hash) |
| `rol` | UUID | Catálogo: ADMIN, DOCENTE, ALUMNO |
| `usuario_rol` | Compuesta | Relación N:M multi-rol |
| `auditoria_log` | BIGSERIAL | Log inmutable con RLS (INSERT-only) |

### Tipos ENUM
- `tipo_actividad`: EXAMEN, TAREA, PROYECTO, PRACTICA_LAB, FORO, PARTICIPACION, ASISTENCIA
