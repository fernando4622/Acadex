from pydantic import BaseModel
from typing import Optional

class MateriaCarreraBase(BaseModel):
    materia_id: int
    carrera_id: int
    estado: Optional[str] = "ACTIVA"

class MateriaCarreraResponse(MateriaCarreraBase):
    id: int
    materia_nombre: Optional[str] = None
    carrera_nombre: Optional[str] = None

    class Config:
        from_attributes = True
