from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CarreraBase(BaseModel):
    clave: str
    nombre: str
    descripcion: Optional[str] = None
    activo: bool = True

class CarreraCreate(CarreraBase):
    pass

class CarreraResponse(CarreraBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
