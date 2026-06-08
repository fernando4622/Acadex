from pydantic import BaseModel, Field
from typing import Optional  
from uuid import UUID
from datetime import time, date



class GrupoCreate(BaseModel):
    nombre:              str
    plan_materia_id:     int
    docente_id:          UUID
    periodo_id:          int
    calificacion_maxima: float = Field(default=100.0, gt=0)
    letra_grupo:         Optional[str] = None
    # clave_grupo se autogenera: no se recibe desde el cliente

class GrupoResponse(BaseModel):
    id:                  UUID      # Grupo se mantiene UUID
    nombre:              str
    plan_materia_id:     int
    docente_id:          UUID
    periodo_id:          int
    calificacion_maxima: float
    estado:              str
    materia:             Optional[str] = None
    clave_materia:       Optional[str] = None
    letra_grupo:         Optional[str] = None
    carrera_nombre:      Optional[str] = None
    carrera_id:          Optional[int] = None
    carreras_ids:        Optional[list[int]] = None
    plan_nombre:         Optional[str] = None
    periodo_inicio:      Optional[date] = None
    periodo_fin:         Optional[date] = None
    docente_nombre:      Optional[str] = None
    semestre:            Optional[int] = None
