-- Desactiva cuentas únicamente cuando todavía conservan una combinación
-- de correo y hash publicada anteriormente por el repositorio.
-- No modifica cuentas que ya hayan rotado su contraseña.

UPDATE academ.usuario
SET activo = FALSE
WHERE (LOWER(email), MD5(password_hash)) IN (
    (
        'admin@escuela.edu',
        '6ece4297bbf4616cccaf35ebae9c034c'
    ),
    (
        'admin@escuela.edu',
        '5ab87e554306caba87ec84f268c74365'
    ),
    (
        'admin@veracruz.tecnm.mx',
        '5ab87e554306caba87ec84f268c74365'
    ),
    (
        'c.martinez@escuela.edu',
        '5ab87e554306caba87ec84f268c74365'
    )
);
