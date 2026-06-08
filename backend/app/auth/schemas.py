from pydantic import BaseModel
from uuid import UUID


class LoginRequest(BaseModel):
    username: str      # Número de control para alumnos, email/num_empleado para docentes/admin
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str         = "bearer"
    roles:        list[str]           # multi-rol
    nombre:       str
    id_entidad:   str | None  = None


class UsuarioCreate(BaseModel):
    username:   str           # num_control para alumnos; email o num_empleado para otros roles
    password:   str
    roles:      list[str]     # uno o varios roles al crear
    alumno_id:  UUID | None   = None
    docente_id: UUID | None   = None


class CambiarPasswordRequest(BaseModel):
    password_actual: str
    password_nueva: str
