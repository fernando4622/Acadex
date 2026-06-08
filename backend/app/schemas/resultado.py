from pydantic import BaseModel
from uuid import UUID

class ResultadoUnidadResponse(BaseModel):
    inscripcion_id: UUID
    unidad_id:      int       # SERIAL en la BD
    promedio_base:  float
    bonus_aplicado: float
    resultado_final:float
    version:        int

class ResultadoMateriaResponse(BaseModel):
    inscripcion_id:      UUID
    promedio_base:       float
    bonus_aplicado:      float
    resultado_calculado: float
    resultado_override:  float | None
    resultado_final:     float
    version:             int
