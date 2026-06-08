from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class PlanEstudioBase(BaseModel):
    nombre: str
    carrera_id: int
    vigente: bool = True

class PlanEstudioCreate(PlanEstudioBase):
    pass

class PlanEstudioResponse(PlanEstudioBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
