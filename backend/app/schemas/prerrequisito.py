from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class PrerrequisitoBase(BaseModel):
    plan_materia_id: int
    requisito_id: int
    activo: bool = True

class PrerrequisitoCreate(PrerrequisitoBase):
    pass

class PrerrequisitoResponse(BaseModel):
    id: int
    plan_materia_id: int
    requisito_id: int
    activo: bool
    created_at: datetime
    # Info extendida para el UI
    materia_nombre: Optional[str] = None
    requisito_nombre: Optional[str] = None
    requisito_clave: Optional[str] = None

    class Config:
        from_attributes = True
