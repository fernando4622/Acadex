from pydantic import BaseModel
from typing import Optional, List

class MateriaCreate(BaseModel):
    nombre: str
    clave: str
    creditos: Optional[int] = None
    unidades: Optional[str] = None

class MateriaResponse(BaseModel):
    id: int
    materia_id: Optional[int] = None
    nombre: str
    creditos: Optional[int] = None
    horas_teoria: int = 0
    horas_practica: int = 0
    activa: bool
    clave: Optional[str] = None
    total_unidades: Optional[int] = 0
    carrera_id: Optional[int] = None
    carrera_nombre: Optional[str] = None
    carrera_clave: Optional[str] = None
    semestre_referencia: Optional[int] = None
    plan_nombre: Optional[str] = None
    plan_estudio_id: Optional[int] = None
    carreras_ids: Optional[List[int]] = None

    class Config:
        from_attributes = True
