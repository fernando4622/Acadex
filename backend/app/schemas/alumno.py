from pydantic import BaseModel, field_validator
from uuid import UUID


class AlumnoCreate(BaseModel):
    """
    Campos capturados manualmente al registrar un alumno nuevo.
    Campos capturados manualmente al registrar un alumno nuevo.
    no_control, email institucional y NIP se generan automáticamente.
    """
    nombre:           str
    apellido_pat:     str
    apellido_mat:     str | None = None
    fecha_nacimiento: str                         # YYYY-MM-DD — requerido para NIP provisional
    curp:             str | None = None           # recomendado para deduplicación
    carrera_id:       int | None = None
    plan_estudio_id:  int | None = None

    @field_validator("apellido_mat", "curp", mode="before")
    def empty_to_none(cls, v):
        if v == "":
            return None
        return v

    @field_validator("curp", mode="before")
    def curp_upper(cls, v):
        if v:
            return v.upper()
        return v


class AlumnoUpdate(BaseModel):
    nombre:           str | None = None
    apellido_pat:     str | None = None
    apellido_mat:     str | None = None
    activo:           bool | None = None
    curp:             str | None = None
    semestre:         int | None = None
    fecha_nacimiento: str | None = None
    carrera_id:       int | None = None
    plan_estudio_id:  int | None = None


class AlumnoResponse(BaseModel):
    id:                  UUID
    no_control:          str | None = None       # número de control
    curp:                str | None = None
    nombre:              str
    apellido_pat:        str
    apellido_mat:        str | None = None
    email:               str | None = None       # correo institucional auto-generado
    semestre:            int | None = None
    fecha_nacimiento:    str | None = None
    activo:              bool
    usuario_id:          UUID | None = None
    carrera_id:          int | None = None
    plan_estudio_id:     int | None = None


class AlumnoCreatedResponse(AlumnoResponse):
    """
    Respuesta extendida solo al CREAR un alumno.
    Incluye el NIP en texto claro para que el admin lo entregue al alumno.
    """
    nip_provisional:     str
    username:            str


class AlumnoImportPreview(BaseModel):
    """Previsualización de una fila de importación CSV."""
    fila:                int
    nombre:              str
    apellido_pat:        str
    apellido_mat:        str | None = None
    fecha_nacimiento:    str
    curp:                str | None = None
    no_control:          str | None = None       # generado por el backend
    username:            str | None = None       # = no_control
    email:               str | None = None       # correo institucional generado
    nip_provisional:     str | None = None       # YYYYMMDD — texto claro, solo en preview
    plan_estudio_id:     int | None = None
    error:               str | None = None
    ya_existe:           bool = False
