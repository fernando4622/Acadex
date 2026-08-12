from pydantic import BaseModel, Field, model_validator
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
    calificaciones: list[CalificacionBulkItem] = Field(min_length=1)
    motivo:         str | None = None

    @model_validator(mode="after")
    def validar_inscripciones_unicas(self):
        inscripciones = [item.inscripcion_id for item in self.calificaciones]
        if len(inscripciones) != len(set(inscripciones)):
            raise ValueError("Cada inscripción puede aparecer una sola vez por lote.")
        return self
