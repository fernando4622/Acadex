from pydantic import BaseModel, EmailStr
from uuid import UUID

class DocenteCreate(BaseModel):
    num_empleado: str
    nombre:       str
    apellido_pat: str
    apellido_mat: str | None = None
    email:        EmailStr

class DocenteResponse(BaseModel):
    id:           UUID
    num_empleado: str
    nombre:       str
    apellido_pat: str
    apellido_mat: str | None
    email:        str
    activo:       bool
    usuario_id:   UUID | None = None
    grupos_activos: int | None = 0
class DocenteImportPreview(BaseModel):
    """Previsualización de una fila de importación CSV de docentes."""
    fila:             int
    num_empleado:     str | None = None
    nombre:           str
    apellido_pat:     str
    apellido_mat:     str | None = None
    fecha_nacimiento: str | None = None
    email:            str | None = None
    error:            str | None = None
    ya_existe:        bool = False
