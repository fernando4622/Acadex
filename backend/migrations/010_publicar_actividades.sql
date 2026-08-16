-- Formaliza la publicación de actividades y la vista consumida por alumnos.

ALTER TABLE academ.actividad
    ADD COLUMN IF NOT EXISTS publicada BOOLEAN;

-- Antes de este contrato todas las actividades activas eran visibles.
UPDATE academ.actividad
SET publicada = TRUE
WHERE publicada IS NULL;

ALTER TABLE academ.actividad
    ALTER COLUMN publicada SET DEFAULT FALSE,
    ALTER COLUMN publicada SET NOT NULL;

DROP VIEW IF EXISTS academ.v_actividades_alumno;

CREATE VIEW academ.v_actividades_alumno AS
SELECT
    i.alumno_id,
    i.id AS inscripcion_id,
    g.id AS grupo_id,
    g.nombre AS grupo,
    m.nombre AS materia,
    u.id AS unidad_id,
    u.numero AS unidad_numero,
    u.nombre AS unidad_nombre,
    u.estado AS unidad_estado,
    a.id AS actividad_id,
    c.nombre AS tipo_nombre,
    a.descripcion,
    a.ponderacion,
    a.fecha_apertura,
    a.fecha_cierre,
    CASE
        WHEN a.fecha_apertura IS NULL OR NOW() >= a.fecha_apertura THEN TRUE
        ELSE FALSE
    END AS visible,
    CASE
        WHEN a.fecha_cierre IS NULL THEN 'ABIERTA'
        WHEN NOW() > a.fecha_cierre THEN 'CERRADA'
        ELSE 'EN_PLAZO'
    END AS estatus_plazo,
    ra.calificacion,
    ra.estado_entrega,
    ra.fecha_registro,
    ra.fecha_modificacion
FROM academ.inscripcion i
JOIN academ.grupo g ON g.id = i.grupo_id
JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
JOIN academ.materia m ON m.id = pm.materia_id
JOIN academ.unidad u ON u.grupo_id = g.id
JOIN academ.actividad a ON a.unidad_id = u.id
LEFT JOIN academ.tipo_actividad_catalogo c ON c.id = a.tipo_catalogo_id
LEFT JOIN academ.resultado_actividad ra
       ON ra.inscripcion_id = i.id AND ra.actividad_id = a.id
WHERE i.estado = 'ACTIVA'
  AND a.activa = TRUE
  AND a.publicada = TRUE;

COMMENT ON VIEW academ.v_actividades_alumno IS
    'Actividades publicadas para alumnos con tipo, fechas, calificación y estado de entrega.';
