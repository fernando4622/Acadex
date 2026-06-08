from pydantic import BaseModel, Field

class UnidadPlantillaCreate(BaseModel):
    numero: int = Field(gt=0)
    nombre: str

class UnidadPlantillaResponse(BaseModel):
    id:         int
    materia_id: int
    numero:     int
    nombre:     str
