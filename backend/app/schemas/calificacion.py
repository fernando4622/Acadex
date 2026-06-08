from pydantic import BaseModel, Field
from uuid import UUID
from typing import Literal

class CalificacionCreate(BaseModel):
    inscripcion_id: UUID
    calificacion:   float | None = Field(default=None, ge=0)
    estado_entrega: Literal["ENTREGADA","NP","EXENTO"] = "ENTREGADA"
    motivo:         str | None = None

class CalificacionBulkItem(BaseModel):
    inscripcion_id: UUID
    calificacion:   float | None = Field(default=None, ge=0)
    estado_entrega: Literal["ENTREGADA","NP","EXENTO"] = "ENTREGADA"

class CalificacionBulkRequest(BaseModel):
    calificaciones: list[CalificacionBulkItem]
    motivo:         str | None = None
