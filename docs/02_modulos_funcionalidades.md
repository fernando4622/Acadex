# Módulos y Funcionalidades del Sistema

---

## 5. Módulos del Backend (19 Routers)

### 5.1 Autenticación (`/auth`)
- `POST /auth/login` — Login con email+contraseña → JWT token
- `POST /auth/usuarios` — Crear usuario con roles

### 5.2 Alumnos (`/alumnos`)
- `GET /alumnos` — Listar todos (ADMIN)
- `GET /alumnos/{id}` — Obtener alumno específico
- `POST /alumnos` — Crear alumno
- `PATCH /alumnos/{id}` — Actualizar alumno
- `GET /alumnos/me/perfil` — Perfil del alumno autenticado
- `GET /alumnos/me/avance` — Avance académico personal

### 5.3 Docentes (`/docentes`)
- `GET /docentes` — Listar docentes
- `POST /docentes` — Crear docente
- `PUT /docentes/{id}` — Actualizar docente
- `POST /docentes/{id}/crear-acceso` — Generar cuenta de usuario
- `POST /docentes/{id}/reset-password` — Resetear contraseña
- `GET /docentes/{id}/grupos` — Grupos asignados

### 5.4 Catálogos (`/materias`, `/carreras`, `/aulas`, `/planes`)
- CRUD completo de materias con unidades plantilla
- CRUD de carreras y planes de estudio
- Vinculación materia↔plan con semestre/orden
- Gestión de prerrequisitos entre materias
- CRUD de aulas con capacidad

### 5.5 Periodos (`/periodos`)
- CRUD de periodos académicos
- `POST /periodos/{id}/activar` — Activar periodo (desactiva otros)
- `POST /periodos/{id}/cerrar` — Cerrar periodo

### 5.6 Grupos (`/grupos`)
- `GET /grupos` — Listar (filtrado por rol: admin=todos, docente=suyos, alumno=inscritos)
- `POST /grupos` — Crear grupo (auto-copia unidades plantilla, valida horarios)
- `GET /grupos/{id}/horario` — Horario detallado por día
- `GET /grupos/{id}/alumnos` — Lista de inscritos
- `GET /grupos/{id}/resultados` — Resultados del grupo
- `GET /grupos/{id}/resultados/estadisticas` — Estadísticas agregadas
- `POST /grupos/{id}/pre-cerrar` — Transición ACTIVO→PRECIERRE
- `POST /grupos/{id}/finalizar` — Sello definitivo PRECIERRE→FINALIZADO
- `POST /grupos/{id}/bonus/unidad` — Aplicar bonus por unidad
- `POST /grupos/{id}/bonus/materia` — Aplicar bonus por materia
- `POST /grupos/{id}/override` — Override de resultado final
- `DELETE /grupos/{id}` — Eliminar grupo (solo sin inscripciones)

### 5.7 Inscripciones (`/inscripciones`)
- Inscripción individual y masiva por CSV
- Validación de carrera del alumno vs plan del grupo
- Baja de inscripción
- `GET /mis-grupos` — Grupos del alumno autenticado

### 5.8 Unidades (`/unidades`)
- `GET /grupos/{id}/unidades` — Listar unidades del grupo
- `POST /unidades/{id}/cerrar` — Cerrar unidad (persiste snapshots)
- `GET /unidades/{id}/captura-pendiente` — Actividades sin calificar

### 5.9 Actividades (`/actividades`)
- CRUD de actividades evaluables por unidad
- Publicación individual y por unidad completa
- Validación: ponderaciones no exceden 100%

### 5.10 Calificaciones (`/calificaciones`)
- `GET /actividades/{id}/calificaciones` — Listar calificaciones
- `POST /actividades/{id}/calificaciones` — Registrar individual
- `POST /actividades/{id}/calificaciones/bulk` — Registro masivo
- `PATCH /actividades/{id}/calificaciones` — Actualizar

### 5.11 Bonus (`/bonus`)
- Bonus por unidad (requiere 100% captura, unidad en EDICION)
- Bonus por materia (solo en PRECIERRE)

### 5.12 Resultados (`/resultados`)
- `GET /inscripciones/{id}/desglose` — Desglose completo auditadle (JSON)
- `GET /inscripciones/{id}/resultado-dinamico/{unidadId}` — Cálculo en tiempo real

### 5.13 Entregas (`/entregas`)
- Subida de archivos por alumno
- Consulta de entregas por actividad
- Descarga de archivos
- Resumen de entregas para docente

### 5.14 Dashboard (`/dashboard`)
- `/dashboard/admin` — KPIs institucionales, distribución, tendencia, eficiencia docente
- `/dashboard/docente` — KPIs por grupo, pendientes, actividades próximas
- `/dashboard/alumno` — Posicionamiento, percentil, materias en curso
- `/dashboard/reporte-detallado` — Reporte filtrable por grupo

### 5.15 Analytics (`/analytics`)
- `GET /analytics/comparativa-materias` — Comparativa entre dos periodos
- `GET /analytics/docentes-aprobacion` — Ranking docentes por aprobación
- `GET /analytics/mejores-alumnos` — Top 100 alumnos por promedio
- `GET /analytics/desercion` — Tasa de deserción por grupo
- `GET /analytics/reprobacion-historica` — Materias con mayor reprobación histórica

### 5.16 Importación Masiva (`/importar`)
- Alumnos, Docentes, Materias, Grupos, Inscripciones
- Flujo: Preview → Confirmar (previsualización antes de persistir)
- Formato CSV con validaciones

### 5.17 Auditoría (`/auditoria`)
- `GET /auditoria` — Log de auditoría con filtros
- `GET /auditoria/tablas-disponibles` — Tablas auditadas

### 5.18 Asistencia (`/asistencia`)
- Pase de lista por grupo y fecha
- Resumen de asistencia por alumno
- Reporte de asistencia por grupo

### 5.19 Notificaciones (`/notificaciones`)
- Notificaciones por usuario
- Conteo de no leídas
- Marcar como leída individual/todas

---

## 6. Módulos del Frontend (24 Páginas)

| Página | Rol | Descripción |
|--------|-----|-------------|
| `Login` | Público | Autenticación con JWT |
| `Dashboard` | Todos | Panel adaptativo por rol con KPIs y gráficas |
| `Grupos` | Admin/Docente | Gestión de grupos con modal de creación avanzado |
| `GrupoDetalle` | Admin/Docente | Detalle: unidades, actividades, calificaciones, cierre |
| `Calificaciones` | Admin/Docente | Captura de calificaciones por actividad |
| `Resultados` | Todos | Resultados finales con override y bonus |
| `Alumnos` | Admin | CRUD + importación masiva CSV |
| `DocentesAdmin` | Admin | CRUD + creación de acceso + importación CSV |
| `Catalogos` | Admin | Materias con unidades plantilla + importación |
| `Planes` | Admin | Planes de estudio, vinculación drag-and-drop |
| `Carreras` | Admin | CRUD de programas académicos |
| `Aulas` | Admin | Gestión de espacios físicos |
| `Periodos` | Admin/Docente | Gestión de ciclos escolares |
| `Auditoria` | Admin | Visor del log inmutable con filtros |
| `AnalisisComparativo` | Admin | Analytics: comparativas, rankings, deserción |
| `MapaRiesgo` | Admin | Identificación de alumnos en riesgo |
| `TiposActividad` | Admin | Gestión del ENUM de tipos de actividad |
| `MisGrupos` | Alumno | Grupos inscritos del alumno |
| `MisGrupoDetalle` | Alumno | Detalle: actividades, calificaciones, entregas |
| `MisCalificaciones` | Alumno | Vista consolidada de resultados |
| `PaseLista` | Docente | Pase de lista diario |
| `Horario` | Docente/Alumno | Visualización semanal de horarios |
| `Perfil` | Docente/Alumno | Datos personales |
| `Historial` | Alumno | Historial académico |

---

## 7. Flujos de Negocio Principales

### 7.1 Flujo de Evaluación Completo

```
1. SETUP CATÁLOGOS
   Carrera → Plan de Estudio → Vincular Materias (con semestre)
   Materia → Definir Unidades Plantilla
   
2. PREPARACIÓN DEL CICLO
   Crear Periodo → Crear Grupos (auto-copia unidades)
   Asignar Docente + Horario + Aula
   
3. INSCRIPCIONES
   Registrar alumnos en grupos (individual o CSV masivo)
   Validación: carrera del alumno = carrera del plan del grupo
   
4. EVALUACIÓN (por cada unidad)
   Docente crea actividades (tipo + ponderación)
   Σ ponderaciones = 100% (validado por trigger)
   Registrar calificaciones (individual o bulk)
   Aplicar bonus de unidad (opcional, requiere 100% captura)
   
5. CIERRE DE UNIDAD
   sp_cerrar_unidad() → Persiste resultado_unidad (snapshot)
   Calcula promedio ponderado + bonus + tope máximo
   
6. PRE-CIERRE DE MATERIA
   sp_pre_cerrar_materia() → Estado PRECIERRE
   Genera snapshots tentativos en resultado_materia
   Permite: override de resultado, bonus de materia
   
7. SELLO DEFINITIVO
   sp_finalizar_materia() → Estado FINALIZADO
   Recalcula finales respetando overrides
   Bloquea TODO cambio posterior
```

### 7.2 Máquina de Estados del Grupo

```
ACTIVO ──────────▶ PRECIERRE ──────────▶ FINALIZADO
  │                    │                      │
  │ Captura normal     │ Arbitraje:           │ Sellado:
  │ Actividades        │ - Override           │ - Inmutable
  │ Calificaciones     │ - Bonus materia      │ - Solo lectura
  │ Bonus unidad       │ - Recálculo          │
  │ Cierre unidades    │                      │
```

### 7.3 Máquina de Estados de la Unidad

```
EDICION ──────────▶ CERRADA ──────────▶ FINALIZADA
  │                    │                    │
  │ Permite:           │ Persiste:          │ Solo lectura
  │ - CRUD actividades │ - resultado_unidad │ - Bloqueo total
  │ - Calificaciones   │ - Recálculo auto   │
  │ - Bonus unidad     │   si se modifica   │
```

---

## 8. Lógica de Cálculo de Calificaciones

### 8.1 Resultado por Unidad
```
promedio_base = Σ (calificación_i × ponderación_i / 100)
resultado_final = MIN(promedio_base + bonus_unidad, calificación_máxima)
```

### 8.2 Resultado por Materia
```
promedio_base = AVG(resultado_final de cada unidad con snapshot)
resultado_calculado = MIN(promedio_base + bonus_materia, calificación_máxima)
resultado_final = override ?? resultado_calculado
```

### 8.3 Recálculo en Cascada (Triggers)
- Cambio en `resultado_actividad` → recalcula `resultado_unidad` (si cerrada)
- Cambio en `resultado_unidad` → recalcula `resultado_materia`
- Cambio en `bonus_unidad` → recalcula `resultado_unidad` → `resultado_materia`
- Cambio en `bonus_materia` → recalcula `resultado_materia`
