# Ciencia de Datos: Vistas Analíticas, Consultas y Reportes

---

## 9. Vistas Existentes en la BD (Capa BI)

### V01 — `v_suma_ponderaciones`
**Propósito**: Validación en tiempo real de estructura de evaluación.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| unidad_id | INT | ID de la unidad |
| suma_ponderaciones | NUMERIC | Suma actual de ponderaciones |
| pendiente | NUMERIC | Porcentaje faltante para completar 100% |
| estructura_completa | BOOLEAN | TRUE si la suma ≈ 100% |

**Caso de uso**: Dashboard docente — semáforo de unidades listas para captura.

### V02 — `v_resultados_parciales`
**Propósito**: Resultados dinámicos mientras la unidad está en edición.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| inscripcion_id, matricula, alumno | — | Identificación |
| grupo, materia, unidad_numero | — | Contexto académico |
| total_actividades | INT | Actividades definidas |
| actividades_con_resultado | INT | Actividades calificadas |
| promedio_parcial | NUMERIC | Promedio ponderado actual |
| resultado_estimado | NUMERIC | Con bonus y tope aplicados |
| resultado_persistido | NUMERIC | Snapshot (si existe) |

**Caso de uso**: Vista en tiempo real del avance de captura y promedios estimados.

### V03 — `v_resultados_finales`
**Propósito**: Acta de calificaciones finales por grupo.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| grupo, materia, periodo, docente | — | Contexto |
| matricula, alumno | — | Estudiante |
| promedio_base | NUMERIC | Promedio sin bonus |
| bonus_materia | NUMERIC | Bonus aplicado |
| resultado_calculado | NUMERIC | Automático |
| resultado_override | NUMERIC | Manual (si existe) |
| resultado_final | NUMERIC | Publicado |
| estatus | TEXT | APROBADO / REPROBADO / PENDIENTE |

**Caso de uso**: Actas oficiales, reportes de grupo, indicadores de aprobación.

### V04 — `v_captura_pendiente`
**Propósito**: Identificar calificaciones faltantes por capturar.

**Caso de uso**: Alertas al docente sobre actividades sin calificar.

### V05 — `v_auditoria`
**Propósito**: Log legible de todas las operaciones del sistema.

**Caso de uso**: Compliance, trazabilidad, investigación de incidentes.

### V06 — `vw_mis_grupos`
**Propósito**: Vista optimizada para el portal del alumno.

**Caso de uso**: Pantalla principal del alumno con resultado final estimado.

---

## 10. Vistas Analíticas (BI / KPIs)

### V_ANALITICA_DOCENTE
**Propósito**: Rendimiento comparativo del grupo del docente vs promedio institucional.

| KPI | Cálculo | Insight |
|-----|---------|---------|
| promedio_grupo | AVG(resultado_final) por grupo | Nivel académico del grupo |
| promedio_materia | AVG global de la materia en el periodo | Benchmark institucional |
| diferencia_vs_materia | promedio_grupo - promedio_materia | ¿Sobre o bajo el promedio? |
| rendimiento_relativo | SOBRE/BAJO/EN_PROMEDIO | Clasificación cualitativa |
| eficiencia_terminal_pct | 100 × aprobados / total | Tasa de éxito del docente |
| desviacion_estandar | STDDEV(resultado_final) | Homogeneidad del grupo |

### V_ANALITICA_ADMIN
**Propósito**: Panel institucional con ranking por materia/docente.

| KPI | Cálculo | Insight |
|-----|---------|---------|
| tasa_reprobacion_pct | 100 × reprobados / con_resultado | Materias problemáticas |
| eficiencia_terminal_pct | 100 × aprobados / inscritos | Efectividad real |
| calificacion_maxima/minima | MAX/MIN resultado_final | Rango del grupo |
| num_grupos | COUNT DISTINCT grupo | Cobertura de la materia |

### V_ANALITICA_ALUMNO
**Propósito**: Posicionamiento individual del alumno en su grupo.

| KPI | Cálculo | Insight |
|-----|---------|---------|
| posicion_grupo | RANK() DESC por resultado | Lugar en el grupo |
| percentil_superior | (1 - PERCENT_RANK) × 100 | Top N% del grupo |
| diferencia_vs_media | resultado - promedio_grupo | Distancia a la media |
| posicion_relativa | SOBRE/BAJO/EN_MEDIA | Clasificación |

### V_ACTIVIDADES_ALUMNO
**Propósito**: Calendario de evaluaciones con estado de entrega.

---

## 11. Endpoints Analíticos para Data Science

### 11.1 Comparativa Inter-Periodos
```
GET /analytics/comparativa-materias?periodo_a=1&periodo_b=2
```
**Retorna**: Promedio por materia en cada periodo, diferencia, % reprobación, inscritos.  
**Aplicación**: Detectar tendencias de mejora/deterioro académico por materia entre ciclos.

### 11.2 Ranking de Docentes por Aprobación
```
GET /analytics/docentes-aprobacion?periodo_id=1
```
**Retorna**: Docente, num_grupos, total_alumnos, pct_aprobacion, promedio_general.  
**Aplicación**: Evaluar efectividad docente, identificar mejores prácticas.

### 11.3 Mejores Alumnos (Top 100)
```
GET /analytics/mejores-alumnos?periodo_id=1
```
**Retorna**: Alumno, promedio, materias cursadas, materias reprobadas.  
**Aplicación**: Becas, reconocimientos, programas de excelencia.

### 11.4 Tasa de Deserción
```
GET /analytics/desercion?periodo_id=1
```
**Retorna**: Grupo, materia, docente, inscritos, sin_actividad, tasa_desercion_pct.  
**Aplicación**: Alerta temprana de abandono, intervención oportuna.

### 11.5 Reprobación Histórica
```
GET /analytics/reprobacion-historica
```
**Retorna**: Materia, total_evaluados, reprobados, pct_reprobacion, promedio_historico, periodos_impartidos.  
**Aplicación**: Identificar materias "cuello de botella" en el currículo.

### 11.6 Dashboard Admin (Agregado)
```
GET /dashboard/admin
```
**Retorna**:
- `globales`: promedio_general, mediana, desviación, tasa_reprobación
- `distribucion`: histograma de calificaciones (rangos de 10)
- `por_materia`: top 20 con peor tasa de reprobación
- `tendencia`: promedio por periodo (serie temporal)
- `eficiencia_docentes`: ranking top 10
- `totales`: conteos de catálogos (alumnos, docentes, materias, grupos)

---

## 12. Consultas SQL Propuestas para Ciencia de Datos

### 12.1 Análisis de Distribución de Calificaciones

```sql
-- Histograma de calificaciones finales por materia
SELECT m.nombre AS materia,
       width_bucket(rm.resultado_final, 0, 100, 10) AS bucket,
       COUNT(*) AS frecuencia,
       ROUND(AVG(rm.resultado_final)::NUMERIC, 2) AS promedio_bucket
FROM academ.resultado_materia rm
JOIN academ.inscripcion i ON i.id = rm.inscripcion_id
JOIN academ.grupo g ON g.id = i.grupo_id
JOIN academ.materia m ON m.id = g.materia_id
GROUP BY m.nombre, bucket
ORDER BY m.nombre, bucket;
```

### 12.2 Correlación Actividades vs Resultado Final

```sql
-- ¿Qué tipo de actividad correlaciona más con el resultado final?
SELECT a.tipo::TEXT AS tipo_actividad,
       ROUND(CORR(ra.calificacion, rm.resultado_final)::NUMERIC, 4) AS correlacion,
       COUNT(*) AS n_observaciones
FROM academ.resultado_actividad ra
JOIN academ.actividad a ON a.id = ra.actividad_id
JOIN academ.resultado_materia rm ON rm.inscripcion_id = ra.inscripcion_id
WHERE ra.calificacion IS NOT NULL AND rm.resultado_final IS NOT NULL
GROUP BY a.tipo
ORDER BY correlacion DESC;
```

### 12.3 Alumnos en Riesgo Académico

```sql
-- Alumnos con promedio < 70 en materias activas (alerta temprana)
SELECT al.matricula, al.nombre || ' ' || al.apellido_pat AS alumno,
       m.nombre AS materia, g.nombre AS grupo,
       ROUND(calc.resultado_final::NUMERIC, 2) AS promedio_estimado,
       calc.unidades_con_result || '/' || calc.unidades_totales AS avance
FROM academ.inscripcion i
JOIN academ.alumno al ON al.id = i.alumno_id
JOIN academ.grupo g ON g.id = i.grupo_id
JOIN academ.materia m ON m.id = g.materia_id
LEFT JOIN LATERAL academ.fn_calcular_resultado_materia(i.id) calc ON TRUE
WHERE i.estado = 'ACTIVA' AND g.estado != 'FINALIZADO'
  AND calc.resultado_final < 70 AND calc.resultado_final IS NOT NULL
ORDER BY calc.resultado_final ASC;
```

### 12.4 Efectividad del Bonus en Aprobación

```sql
-- ¿Cuántos alumnos pasaron de reprobado a aprobado gracias al bonus?
SELECT COUNT(*) AS total_beneficiados,
       COUNT(*) FILTER (WHERE rm.promedio_base < 70 AND rm.resultado_final >= 70) AS rescatados_por_bonus,
       ROUND(100.0 * COUNT(*) FILTER (WHERE rm.promedio_base < 70 AND rm.resultado_final >= 70)
             / NULLIF(COUNT(*), 0), 1) AS pct_rescatados
FROM academ.resultado_materia rm
WHERE rm.bonus_aplicado > 0 OR rm.resultado_override IS NOT NULL;
```

### 12.5 Análisis de Deserción Temprana

```sql
-- Alumnos inscritos sin ninguna calificación registrada
SELECT al.matricula, al.nombre || ' ' || al.apellido_pat AS alumno,
       m.nombre AS materia, g.nombre AS grupo,
       i.fecha_inscripcion,
       CURRENT_DATE - i.fecha_inscripcion AS dias_desde_inscripcion
FROM academ.inscripcion i
JOIN academ.alumno al ON al.id = i.alumno_id
JOIN academ.grupo g ON g.id = i.grupo_id
JOIN academ.materia m ON m.id = g.materia_id
WHERE i.estado = 'ACTIVA'
  AND NOT EXISTS (
    SELECT 1 FROM academ.resultado_actividad ra WHERE ra.inscripcion_id = i.id
  )
ORDER BY dias_desde_inscripcion DESC;
```

### 12.6 Rendimiento Docente Multi-Periodo

```sql
-- Evolución del promedio de un docente a través de periodos
SELECT d.nombre || ' ' || d.apellido_pat AS docente,
       p.codigo AS periodo, p.fecha_inicio,
       COUNT(DISTINCT g.id) AS grupos,
       COUNT(DISTINCT i.id) AS alumnos,
       ROUND(AVG(rm.resultado_final)::NUMERIC, 2) AS promedio,
       ROUND(100.0 * COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70)
             / NULLIF(COUNT(rm.id), 0), 1) AS pct_aprobacion
FROM academ.docente d
JOIN academ.grupo g ON g.docente_id = d.id
JOIN academ.periodo_academico p ON p.id = g.periodo_id
JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
GROUP BY d.id, d.nombre, d.apellido_pat, p.codigo, p.fecha_inicio
ORDER BY d.nombre, p.fecha_inicio;
```

### 12.7 Mapa de Calor: Materia × Unidad

```sql
-- Promedio por unidad por materia (identificar unidades difíciles)
SELECT m.nombre AS materia, u.numero AS unidad, u.nombre AS nombre_unidad,
       ROUND(AVG(ru.resultado_final)::NUMERIC, 2) AS promedio_unidad,
       COUNT(*) AS evaluados,
       ROUND(STDDEV(ru.resultado_final)::NUMERIC, 2) AS desviacion
FROM academ.resultado_unidad ru
JOIN academ.unidad u ON u.id = ru.unidad_id
JOIN academ.grupo g ON g.id = u.grupo_id
JOIN academ.materia m ON m.id = g.materia_id
GROUP BY m.nombre, u.numero, u.nombre
ORDER BY m.nombre, u.numero;
```

### 12.8 Análisis de Auditoría (Patrones de Uso)

```sql
-- Actividad del sistema por hora del día y día de la semana
SELECT EXTRACT(DOW FROM ts) AS dia_semana,
       EXTRACT(HOUR FROM ts) AS hora,
       operacion, COUNT(*) AS cantidad
FROM academ.auditoria_log
WHERE ts >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY dia_semana, hora, operacion
ORDER BY dia_semana, hora;
```

### 12.9 Cohort Analysis: Aprobación por Generación

```sql
-- Tasa de aprobación agrupada por fecha de inscripción del alumno
SELECT DATE_TRUNC('month', al.created_at) AS cohorte,
       COUNT(DISTINCT al.id) AS alumnos,
       ROUND(AVG(rm.resultado_final)::NUMERIC, 2) AS promedio,
       ROUND(100.0 * COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70)
             / NULLIF(COUNT(rm.id), 0), 1) AS pct_aprobacion
FROM academ.alumno al
JOIN academ.inscripcion i ON i.alumno_id = al.id
JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
GROUP BY cohorte ORDER BY cohorte;
```

### 12.10 Predicción de Riesgo (Features para ML)

```sql
-- Dataset para modelo predictivo de reprobación
SELECT al.id AS alumno_id,
       i.id AS inscripcion_id,
       -- Features del alumno
       COUNT(DISTINCT prev_i.id) AS materias_previas,
       COALESCE(AVG(prev_rm.resultado_final), 0) AS promedio_historico,
       COUNT(prev_rm.id) FILTER (WHERE prev_rm.resultado_final < 70) AS reprobaciones_previas,
       -- Features de la materia actual
       COUNT(ra.id) AS actividades_entregadas,
       ROUND(AVG(ra.calificacion)::NUMERIC, 2) AS promedio_actividades,
       -- Target
       CASE WHEN rm.resultado_final >= 70 THEN 1 ELSE 0 END AS aprobado
FROM academ.inscripcion i
JOIN academ.alumno al ON al.id = i.alumno_id
LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
LEFT JOIN academ.resultado_actividad ra ON ra.inscripcion_id = i.id
-- Historial previo
LEFT JOIN academ.inscripcion prev_i ON prev_i.alumno_id = al.id AND prev_i.id != i.id
LEFT JOIN academ.resultado_materia prev_rm ON prev_rm.inscripcion_id = prev_i.id
WHERE rm.resultado_final IS NOT NULL
GROUP BY al.id, i.id, rm.resultado_final;
```

---

## 13. Reportes Propuestos

| # | Reporte | Datos Fuente | Audiencia | Frecuencia |
|---|---------|-------------|-----------|------------|
| R1 | Acta de Calificaciones | v_resultados_finales | Dirección | Por grupo/periodo |
| R2 | Eficiencia Terminal | v_analitica_admin | Rectoría | Semestral |
| R3 | Ranking Docente | analytics/docentes-aprobacion | Coord. Académica | Semestral |
| R4 | Mapa de Riesgo | Consulta 12.3 | Tutorías | Mensual |
| R5 | Materias Cuello de Botella | analytics/reprobacion-historica | Diseño Curricular | Anual |
| R6 | Deserción Temprana | analytics/desercion | Dirección | Quincenal |
| R7 | Impacto del Bonus | Consulta 12.4 | Coord. Académica | Semestral |
| R8 | Evolución por Cohorte | Consulta 12.9 | Planeación | Anual |
| R9 | Heatmap Unidades Difíciles | Consulta 12.7 | Docentes | Semestral |
| R10 | Auditoría de Operaciones | v_auditoria + Consulta 12.8 | Contraloría | Mensual |

---

## 14. Integridad y Seguridad de Datos

### 14.1 Triggers de Validación (10)
| Trigger | Tabla | Regla |
|---------|-------|-------|
| TG01 | alumno, docente, grupo | Auto-update de `updated_at` |
| TG02 | actividad | Σ ponderaciones ≤ 100%, unidad en EDICION |
| TG03 | actividad | Auditoría automática de cambios |
| TG04 | resultado_actividad | Inscripción activa, rango válido, unidad no FINALIZADA |
| TG05 | resultado_actividad | Auditoría de cambios de calificación |
| TG06 | resultado_actividad | Recálculo automático de resultado_unidad |
| TG07 | bonus_unidad | Recálculo en cascada |
| TG08 | bonus_materia | Recálculo en cascada |
| TG09 | resultado_actividad | Bloqueo de DELETE físico |
| TG10 | resultado_actividad | Ponderaciones deben sumar 100% para capturar |

### 14.2 Row Level Security
- `auditoria_log`: INSERT-only (no UPDATE, no DELETE)
- Políticas RLS para inmutabilidad del log

### 14.3 Stored Procedures con Validación
- `sp_cerrar_unidad`: Valida ponderaciones, captura completa, persiste snapshots
- `sp_pre_cerrar_materia`: Requiere todas las unidades cerradas
- `sp_finalizar_materia`: Requiere PRECIERRE previo, sello definitivo
- `sp_aplicar_bonus_unidad`: Validación de captura 100%, flujo secuencial
- `sp_override_resultado_materia`: Solo en PRECIERRE, justificación ≥ 20 chars

---

## 15. Potencial de Expansión como Sistema de Información

### 15.1 Dimensiones Analíticas Disponibles

| Dimensión | Tabla/Campo | Granularidad |
|-----------|------------|-------------|
| **Tiempo** | periodo_academico, created_at | Semestre, mes, día |
| **Estudiante** | alumno (matrícula, carrera) | Individual |
| **Docente** | docente (num_empleado) | Individual |
| **Materia** | materia (clave, créditos) | Por asignatura |
| **Programa** | carrera, plan_estudio | Por carrera |
| **Evaluación** | tipo_actividad, ponderación | Por tipo de evaluación |
| **Geográfica** | aula | Por espacio físico |

### 15.2 Métricas Clave (Fact Table Candidates)

| Métrica | Origen | Tipo |
|---------|--------|------|
| Calificación por actividad | resultado_actividad | Atómica |
| Promedio por unidad | resultado_unidad | Agregada |
| Resultado final de materia | resultado_materia | Agregada |
| Tasa de aprobación | Calculada | KPI |
| Tasa de deserción | Calculada | KPI |
| Eficiencia terminal | Calculada | KPI |
| Percentil del alumno | v_analitica_alumno | Ranking |
| Asistencia | asistencia | Atómica |

### 15.3 Recomendaciones para Data Warehouse

1. **Materializar vistas analíticas** como `MATERIALIZED VIEW` con `REFRESH CONCURRENTLY` programado
2. **Crear tabla de hechos** `fact_resultado` desnormalizada para consultas OLAP
3. **Implementar dimensiones** tipo SCD-2 para rastrear cambios en docentes/materias
4. **Exportar a Parquet/CSV** para análisis en Python (pandas, scikit-learn)
5. **Conectar a herramientas BI** como Metabase, Superset o Power BI via PostgreSQL nativo
