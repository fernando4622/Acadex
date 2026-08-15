from enum import Enum
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TipoActividad(str, Enum):
    EXAMEN        = "EXAMEN"
    TAREA         = "TAREA"
    PROYECTO      = "PROYECTO"
    PRACTICA_LAB  = "PRACTICA_LAB"
    FORO          = "FORO"
    PARTICIPACION = "PARTICIPACION"
    ASISTENCIA    = "ASISTENCIA"


class ActividadCreate(BaseModel):
    nombre:         Optional[str] = Field(None, max_length=200)
    descripcion:    Optional[str] = Field(None, max_length=200)
    ponderacion:    float = Field(gt=0, le=100)
    tipo_catalogo_id: int 

class ActividadUpdate(BaseModel):
    nombre:         Optional[str]           = Field(None, max_length=200)
    descripcion:    Optional[str]           = Field(None, max_length=200)
    ponderacion:    Optional[float]         = Field(default=None, gt=0, le=100)
    tipo_catalogo_id: Optional[int]         = None

class ActividadResponse(BaseModel):
    id:             int
    unidad_id:      int
    tipo_catalogo_id: Optional[int] = None
    tipo_nombre:    Optional[str] = None
    descripcion:    Optional[str] = None
    ponderacion:    float
    activa:         bool
    publicada:      bool = False
