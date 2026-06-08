from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime

class UnidadCreate(BaseModel):
    numero: int = Field(gt=0)
    nombre: str

class UnidadResponse(BaseModel):
    id:                  int       # SERIAL en la BD
    grupo_id:            UUID      # grupo sigue siendo UUID
    numero:              int
    nombre:              str
    estado:              str
    suma_ponderaciones:  float | None = None
    estructura_completa: bool  | None = None
    fecha_cierre:        datetime | None = None

class CerrarUnidadRequest(BaseModel):
    forzar_nulos: bool = False
