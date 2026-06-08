from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection
from app.database import get_conn
from app.middleware.auth import require_admin
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from app.auth.service import hash_password

router = APIRouter(prefix="/administracion", tags=["Administración"])

class AdminCreate(BaseModel):
    nombre: str
    email: str
    password: str

class AsignarAdminRequest(BaseModel):
    docente_id: UUID

@router.get("/administradores", dependencies=[Depends(require_admin)])
async def listar_administradores(conn: Connection = Depends(get_conn)):
    # Traemos usuarios que tienen el rol ADMIN
    query = """
        SELECT u.id, u.email, 
               COALESCE(d.nombre || ' ' || d.apellido_pat, a.nombre, split_part(u.email, '@', 1)) as nombre,
               CASE WHEN d.id IS NOT NULL THEN true ELSE false END as es_docente,
               d.id as docente_id
        FROM academ.usuario u
        JOIN academ.usuario_rol ur ON u.id = ur.usuario_id
        JOIN academ.rol r ON ur.rol_id = r.id AND r.nombre = 'ADMIN'
        LEFT JOIN academ.docente d ON d.usuario_id = u.id
        LEFT JOIN academ.alumno a ON a.usuario_id = u.id
    """
    rows = await conn.fetch(query)
    return [dict(r) for r in rows]

@router.get("/docentes-no-admin", dependencies=[Depends(require_admin)])
async def listar_docentes_no_admin(conn: Connection = Depends(get_conn)):
    query = """
        SELECT d.id, d.nombre, d.apellido_pat, d.apellido_mat, d.email
        FROM academ.docente d
        WHERE NOT EXISTS (
            SELECT 1 FROM academ.usuario_rol ur
            JOIN academ.rol r ON ur.rol_id = r.id
            WHERE ur.usuario_id = d.usuario_id AND r.nombre = 'ADMIN'
        )
    """
    rows = await conn.fetch(query)
    return [dict(r) for r in rows]

@router.post("/administradores", dependencies=[Depends(require_admin)])
async def crear_administrador(data: AdminCreate, conn: Connection = Depends(get_conn)):
    hashed = hash_password(data.password)
    async with conn.transaction():
        # Verificar si email existe
        existe = await conn.fetchval("SELECT id FROM academ.usuario WHERE email = $1", data.email)
        if existe:
            raise HTTPException(400, detail={"codigo": "DUPLICADO", "mensaje": "El correo ya está registrado en otro usuario."})
        
        # Crear usuario
        usuario_id = await conn.fetchval(
            "INSERT INTO academ.usuario (email, password_hash) VALUES ($1, $2) RETURNING id",
            data.email, hashed
        )
        
        # Asignar rol ADMIN
        rol_id = await conn.fetchval("SELECT id FROM academ.rol WHERE nombre = 'ADMIN'")
        if not rol_id:
            raise HTTPException(500, detail={"codigo": "ROL_NO_ENCONTRADO", "mensaje": "Rol ADMIN no encontrado en el sistema."})
            
        await conn.execute(
            "INSERT INTO academ.usuario_rol (usuario_id, rol_id) VALUES ($1, $2)",
            usuario_id, rol_id
        )
        
        return {"mensaje": "Administrador creado con éxito", "id": usuario_id}

@router.post("/asignar-admin", dependencies=[Depends(require_admin)])
async def asignar_admin(data: AsignarAdminRequest, conn: Connection = Depends(get_conn)):
    async with conn.transaction():
        # Obtener usuario_id del docente
        usuario_id = await conn.fetchval("SELECT usuario_id FROM academ.docente WHERE id = $1", data.docente_id)
        if not usuario_id:
            raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "El docente especificado no tiene un usuario de acceso creado. Primero créale el acceso en Docentes."})
            
        # Asignar rol ADMIN
        rol_id = await conn.fetchval("SELECT id FROM academ.rol WHERE nombre = 'ADMIN'")
        
        # Check si ya lo tiene
        ya_tiene = await conn.fetchval(
            "SELECT 1 FROM academ.usuario_rol WHERE usuario_id = $1 AND rol_id = $2",
            usuario_id, rol_id
        )
        if ya_tiene:
            raise HTTPException(400, detail={"codigo": "YA_TIENE_ROL", "mensaje": "El docente ya tiene rol de ADMIN."})
            
        await conn.execute(
            "INSERT INTO academ.usuario_rol (usuario_id, rol_id) VALUES ($1, $2)",
            usuario_id, rol_id
        )
        return {"mensaje": "Rol de administrador asignado al docente."}
