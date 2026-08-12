# Migraciones de base de datos

## Fuente de verdad actual

- `bd/database.sql` crea una instalación nueva con el esquema completo vigente.
- Los archivos SQL de este directorio actualizan instalaciones existentes.
- `legacy/` contiene scripts históricos y nunca debe ejecutarse automáticamente.

Esta separación es transitoria. La consolidación completa del esquema inicial se realizará en los siguientes módulos de `ACADEX-005`.

## Ejecución

Desde `backend`, con las variables `DATABASE_URL` o `DB_*` configuradas:

```powershell
python scripts/aplicar_migraciones.py
```

Para inspeccionar la secuencia sin conectarse:

```powershell
python scripts/aplicar_migraciones.py --listar
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
