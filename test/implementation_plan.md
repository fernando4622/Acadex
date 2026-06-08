# Plan de Implementación de Ciclo de Vida (Unidades y Materias)

## Estatus Actual
En respuesta a tu pregunta: **Sí llegué a hacer pruebas de un parche en base de datos, pero ya he revertido el 100% de los cambios.** Por lo tanto, tu base de datos y tu código se encuentran intactos y limpios respecto a este tema, tal como estaban al inicio de esta conversación.

## Análisis de tus Nuevos Requerimientos
He estructurado tu petición en 4 pilares. Este será nuestro plan de acción:

### 1. Borrador de Finalizado y Sello Definitivo (Grupos)
Para lograr el "estado borrador" que pides para la materia, modificaremos la base de datos para introducir un nuevo estado `PRE_CIERRE` (o "Pendiente Sello").
- **Flujo**: `ACTIVO` -> `PRE_CIERRE` -> `FINALIZADO`.
- **Qué permite**: Estando en `PRE_CIERRE`, el sistema ya calcula los promedios finales tentativos. Aquí es donde el Docente/Admin puede arbitrar aplicando **Bonus de Materia** y los **Overrides (Ajustes manuales)**. 
- **El Bloqueo**: Una vez que el Admin/Docente hace clic en "Sellar Materia" el estado pasará a `FINALIZADO`. Estando en `FINALIZADO` se rechazarán de raíz todos los intentos de Bonus de Materia o Override (es decir, el Sello de Auditoría que solicitas).

### 2. Bloqueo y Reglas de "Bonus de Unidad"
- El **Bonus de la Unidad** se bloquea tajantemente una vez que el estado de la UNIDAD sea `CERRADA`.
- Mientras la unidad siga `EN EDICION`, el sistema permitirá aplicar o editar el bonus de unidad **ÚNICAMENTE** si el 100% de las actividades de esa unidad han sido capturadas y calificadas. Si el profesor intenta poner un bonus cuando hay alumnos sin calificar, le saldrá un error denegándolo.

### 3. Eliminación Segura de Unidades
- Agregaremos el botón de basura (Eliminar Unidad) exclusivo para el Admin.
- **Condición**: Sólo se permitirá borrar la unidad si la unidad sigue en estado `EDICION` y si sus actividades están en cero. Esto forzará al administrador a vaciar y limpiar todo conscientemente antes de tirar la unidad, previniendo accidentes.

### 4. Plantillas de Materia por Defecto (Resolviendo tu pregunta)
*"¿qué opinas de hacer que las unidades estén relacionadas a la materia para que al crear un nuevo grupo vengan cargadas por default?"*
> **Mi opinión como Arquitecto:** Es una de las mejores prácticas (conocidas como "Syllabus" o "Plantillas de Cátedra"). Esto estandariza la calidad educativa de tu institución.
> **¿Cómo lo implementaríamos?** En lugar de que el profesor arme las unidades de cero, crearíamos una tabla `academ.materia_unidad_plantilla`. Cuando el Admin registra un grupo nuevo de cálculo diferencial, el sistema automáticamente copia las 4 unidades institucionales hacia el grupo nuevo. El maestro entonces sólo tiene que crear sus actividades dentro de ellas. **No obstante, debido al tamaño estructural de esto, te sugiero dejar este pilar para una Fase posterior, y ahorita concentrarnos y estabilizar los pilares 1, 2 y 3.**

## User Review Required
> [!IMPORTANT]
> - ¿Estás de acuerdo con el ciclo de vida `ACTIVO -> PRE_CIERRE -> FINALIZADO` para los grupos y sus bloqueos respectivos?
> - ¿Deseas aprobar este plan para que inicie de inmediato a codificar las modificaciones de base de datos (`PRE_CIERRE`), Frontend (`Eliminación Unidad`) y la validación estricta de captura (`Bonus Unidad`)?
