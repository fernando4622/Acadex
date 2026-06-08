from pydantic import BaseModel
from uuid import UUID
from datetime import date

class InscripcionCreate(BaseModel):
    alumno_id:         UUID
    fecha_inscripcion: date | None = None

class InscripcionResponse(BaseModel):
    id:               UUID
    alumno_id:        UUID
    grupo_id:         UUID
    periodo_id:       int
    fecha_inscripcion: date
    estado:           str
    alumno_nombre:    str | None = None
    alumno_matricula: str | None = None
