# Migraciones de base de datos

## Fuente de verdad actual

- `bd/database.sql` crea una instalación nueva con el esquema completo vigente.
- Los archivos SQL de este directorio actualizan instalaciones existentes.
- `legacy/` contiene scripts históricos y nunca debe ejecutarse automáticamente.

Esta separación es transitoria. La consolidación completa del esquema inicial se realizará en los siguientes módulos de `ACADEX-005`.

## Ejecución

Desde `backend`, con las variables `DATABASE_URL` o `DB_*` configuradas:

```powershell
python -m scripts.aplicar_migraciones
```

Para inspeccionar la secuencia sin conectarse:

```powershell
python -m scripts.aplicar_migraciones --listar
```

El ejecutor:

- procesa únicamente archivos `NNN_nombre_en_espanol.sql` del directorio actual;
- ignora deliberadamente `legacy/`;
- registra versión, nombre y checksum SHA-256 en `academ.migracion_esquema`;
- rechaza una migración aplicada cuyo contenido haya cambiado;
- usa un bloqueo transaccional para evitar ejecuciones concurrentes;
- aplica todas las migraciones pendientes en una sola transacción.

## Reglas

1. No modificar una migración después de aplicarla y publicarla.
2. Crear un archivo con el siguiente número para cualquier corrección posterior.
3. Escribir migraciones repetibles cuando sea razonable, pero no depender únicamente de ello.
4. Respaldar la base antes de cambios destructivos o de transformación de datos.
5. No incluir credenciales ni datos reales.

## Catálogos académicos vigentes

La migración `004_crear_planes_estudio.sql` establece la relación soportada:

```text
carrera → plan_estudio → plan_materia → materia
```

No crea datos institucionales ni intenta reconstruir asociaciones históricas. En una actualización,
los vínculos existentes deben migrarse con una estrategia de datos explícita antes de retirar cualquier
estructura anterior.

## Inventario de scripts SQL heredados

Los archivos de `bd/` todavía no forman una secuencia ejecutable completa. Su clasificación actual es:

| Archivo | Estado | Decisión |
|---|---|---|
| `database.sql` | Bootstrap principal, pero incompleto respecto al backend actual | Mantener temporalmente y consolidar en `ACADEX-005` |
| `003_expansion.sql` | Parcialmente aplicado; mezcla núcleo y capacidades avanzadas | Extraer cada capacidad en una migración independiente solo cuando se active |
| `004_registro_alumnos.sql` | Modelo `username`/`nip_hash` no utilizado por la autenticación actual | No ejecutar; candidato a `legacy/` |
| `005_horarios.sql` | Define la capacidad avanzada `horario_grupo` | Promover cuando se formalice la detección de choques de horario |
| `006_asistencia_auto.sql` | Módulo de asistencia sin consumidor activo en el backend | Mantener fuera de la secuencia hasta decidir el producto |
| `007_asistencia_cadena.sql` | Reemplaza rutinas de `006`, pero depende de su tabla | Mantener fuera de la secuencia junto con `006` |
| `db_expansion_v2.sql` | Contiene `materia_carrera`, reemplazada conceptualmente por `plan_materia → plan_estudio → carrera` | No recrear `materia_carrera`; retirar sus referencias residuales del backend |
| `backend/app/database/fix_*.sql` | Reparaciones manuales sin versionar | Comparar contra las definiciones canónicas antes de archivarlas |
| `backend/scratch/*.sql` | Salidas de diagnóstico | Nunca ejecutar como migraciones |

El comando siguiente compara el contrato mínimo utilizado por el backend con una base real:

```powershell
python -m scripts.verificar_esquema
```

Para comprobar estáticamente lo que producirían `bd/database.sql` y las migraciones soportadas:

```powershell
python -m scripts.verificar_esquema --bootstrap ../bd/database.sql
```

Mientras la consolidación siga pendiente, este segundo comando termina con código `1` y enumera
los objetos y columnas vigentes que todavía no están declarados por el camino de instalación limpio.
El contrato usa exclusivamente los nombres actuales (`no_control`, `plan_materia_id`, `estado` y
`tipo_catalogo_id`); los nombres históricos no se aceptan como equivalentes.

El verificador separa errores del núcleo de capacidades avanzadas no instaladas.
Las capacidades opcionales se informan sin invalidar una instalación básica.

## Capacidades avanzadas

Estas estructuras deben implementarse como migraciones independientes, no como parte accidental del núcleo:

- `avance_reticular`: seguimiento consolidado del avance académico.
- `entrega_actividad`: evidencias y versiones de tareas entregadas.
- `horario_grupo`: detección de choques entre horarios.
- `notificacion`: alertas internas para alumnos y docentes.
- `prerrequisito`: bloqueo de inscripción cuando falta una materia requerida.

Aunque existen routers que ya las referencian, no deben considerarse completas hasta que su migración, reglas de negocio y pruebas integradas se entreguen juntas.

`materia_carrera` no pertenece a esta lista: es un modelo anterior. La relación vigente se obtiene desde `plan_materia`, su `plan_estudio` y la `carrera` del plan.
