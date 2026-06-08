from pydantic import BaseModel, Field
from uuid import UUID

class BonusUnidadRequest(BaseModel):
    inscripcion_id: UUID
    unidad_id:      int       # SERIAL en la BD
    monto:          float = Field(ge=0)
    justificacion:  str | None = None

class BonusMateriaRequest(BaseModel):
    inscripcion_id: UUID
    monto:          float = Field(ge=0)
    justificacion:  str | None = None

class OverrideRequest(BaseModel):
    inscripcion_id:     UUID
    resultado_override: float = Field(ge=0)
    justificacion:      str   = Field(min_length=20)
