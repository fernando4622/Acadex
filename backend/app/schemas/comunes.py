"""Tipos y modelos reutilizables entre módulos."""
from pydantic import BaseModel

class MensajeResponse(BaseModel):
    mensaje: str

class IdResponse(BaseModel):
    id: int
    mensaje: str
