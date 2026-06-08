from pydantic import BaseModel
from typing import Optional

class PlanMateriaBase(BaseModel):
    plan_estudio_id: int
    materia_id: int
    clave: Optional[str] = None
    semestre: int
    orden: Optional[int] = 0
    obligatoria: bool = True
    creditos_override: Optional[int] = None

class PlanMateriaCreate(PlanMateriaBase):
    pass

class PlanMateriaResponse(PlanMateriaBase):
    id: int
    materia_nombre: Optional[str] = None
    creditos_base: Optional[int] = None

    class Config:
        from_attributes = True
