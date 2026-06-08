"""
Router de Periodos Académicos — CRUD completo con gestión de estado.
Solo ADMIN puede crear/editar/activar/cerrar periodos.
Todos los roles autenticados pueden leer la lista.
"""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection, UniqueViolationError
from pydantic import BaseModel, field_validator, model_validator
from uuid import UUID

from app.database import get_conn
from app.middleware.auth import require_admin, get_current_user

router = APIRouter(prefix="/periodos", tags=["Periodos"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PeriodoCreate(BaseModel):
    codigo: str                   # EJ26, AD26, etc.
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    estado: str = "proximo"       # proximo | activo | cerrado

    @field_validator("estado")
    @classmethod
    def validar_estado(cls, v):
        if v not in ("proximo", "activo", "cerrado"):
            raise ValueError("estado debe ser proximo, activo o cerrado")
        return v

    @field_validator("codigo")
    @classmethod
    def validar_codigo(cls, v):
        v = v.strip().upper()
        if len(v) < 2:
            raise ValueError("El código del periodo es demasiado corto")
        return v

    @model_validator(mode="after")
    def validar_fechas(self):
        if self.fecha_fin <= self.fecha_inicio:
            raise ValueError("fecha_fin debe ser posterior a fecha_inicio")
        return self


class PeriodoUpdate(BaseModel):
    nombre: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    estado: Optional[str] = None

    @field_validator("estado")
    @classmethod
    def validar_estado(cls, v):
        if v is not None and v not in ("proximo", "activo", "cerrado"):
            raise ValueError("estado debe ser proximo, activo o cerrado")
        return v


class ActivarPeriodoBody(BaseModel):
    confirmar: bool = False  # Debe ser True para confirmar el cierre del activo anterior


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def listar_periodos(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    """Lista todos los periodos ordenados por fecha de inicio descendente."""
    rows = await conn.fetch(
        """SELECT id, codigo, nombre, fecha_inicio, fecha_fin,
                  estado, created_at, updated_at
           FROM academ.periodo_academico
           ORDER BY fecha_inicio DESC"""
    )
    return [
        {
            "id": r["id"],
            "codigo": r["codigo"],
            "nombre": r["nombre"],
            "fecha_inicio": str(r["fecha_inicio"]),
            "fecha_fin": str(r["fecha_fin"]),
            "estado": str(r["estado"]) if r["estado"] is not None else None,
        }
        for r in rows
    ]


@router.get("/activo")
async def obtener_periodo_activo(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    """Devuelve el periodo activo actual, o 404 si no hay ninguno."""
    row = await conn.fetchrow(
        """SELECT id, codigo, nombre, fecha_inicio, fecha_fin,
                  estado
           FROM academ.periodo_academico
           WHERE estado = 'activo'
           LIMIT 1"""
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "SIN_PERIODO_ACTIVO", "mensaje": "No hay ningún periodo activo."})
    return {
        "id": row["id"],
        "codigo": row["codigo"],
        "nombre": row["nombre"],
        "fecha_inicio": str(row["fecha_inicio"]),
        "fecha_fin": str(row["fecha_fin"]),
        "estado": str(row["estado"]) if row["estado"] is not None else None,
    }


@router.get("/{periodo_id}")
async def obtener_periodo(
    periodo_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    row = await conn.fetchrow(
        """SELECT id, codigo, nombre, fecha_inicio, fecha_fin,
                  estado, created_at, updated_at
           FROM academ.periodo_academico WHERE id = $1""",
        periodo_id,
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": f"Periodo {periodo_id} no existe."})
    return dict(row)


@router.post("", status_code=201)
async def crear_periodo(
    body: PeriodoCreate,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_admin),
):
    """Crea un nuevo periodo. Si se crea con estado='activo', cierra el activo anterior."""
    try:
        async with conn.transaction():
            # Si se quiere crear como activo, cerrar el anterior
            if body.estado == "activo":
                await conn.execute(
                    "UPDATE academ.periodo_academico SET estado='cerrado', updated_at=NOW() WHERE estado='activo'"
                )

            row = await conn.fetchrow(
                """INSERT INTO academ.periodo_academico
                       (codigo, nombre, fecha_inicio, fecha_fin, estado)
                   VALUES ($1, $2, $3, $4, $5)
                   RETURNING id, codigo, nombre, fecha_inicio, fecha_fin, estado""",
                body.codigo, body.nombre, body.fecha_inicio, body.fecha_fin,
                body.estado
            )
        return dict(row)
    except UniqueViolationError:
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": f"Ya existe un periodo con código '{body.codigo}'."})


@router.put("/{periodo_id}")
async def actualizar_periodo(
    periodo_id: int,
    body: PeriodoUpdate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """Actualiza campos del periodo. No cambia estado (usar /activar o /cerrar)."""
    # Construir SET dinámico
    campos = {}
    if body.nombre is not None:
        campos["nombre"] = body.nombre
    if body.fecha_inicio is not None:
        campos["fecha_inicio"] = body.fecha_inicio
    if body.fecha_fin is not None:
        campos["fecha_fin"] = body.fecha_fin
    if body.estado is not None:
        campos["estado"] = body.estado

    if not campos:
        raise HTTPException(422, detail={"codigo": "SIN_CAMBIOS", "mensaje": "No se enviaron campos a actualizar."})

    set_clause = ", ".join(f"{k}=${i+2}" for i, k in enumerate(campos))
    values = list(campos.values())

    row = await conn.fetchrow(
        f"""UPDATE academ.periodo_academico
            SET {set_clause}, updated_at=NOW()
            WHERE id=$1
            RETURNING id, codigo, nombre, fecha_inicio, fecha_fin, estado""",
        periodo_id, *values,
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Periodo no encontrado."})
    return dict(row)


@router.post("/{periodo_id}/activar")
async def activar_periodo(
    periodo_id: int,
    body: ActivarPeriodoBody,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_admin),
):
    """
    Activa un periodo. Si hay otro activo, lo cierra automáticamente.
    Requiere confirmar=True si ya existe un periodo activo.
    """
    # Verificar que el periodo existe
    periodo = await conn.fetchrow(
        "SELECT id, codigo, nombre, estado FROM academ.periodo_academico WHERE id=$1",
        periodo_id,
    )
    if not periodo:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Periodo no encontrado."})

    if periodo["estado"] == "activo":
        raise HTTPException(400, detail={"codigo": "YA_ACTIVO", "mensaje": "El periodo ya está activo."})

    # Verificar si hay un periodo activo actualmente
    activo_previo = await conn.fetchrow(
        "SELECT id, codigo, nombre FROM academ.periodo_academico WHERE estado='activo'"
    )

    if activo_previo and not body.confirmar:
        return {
            "requiere_confirmacion": True,
            "periodo_activo_actual": dict(activo_previo),
            "mensaje": f"El periodo '{activo_previo['nombre']}' está activo. Confirme el cambio enviando confirmar=true.",
        }

    # Ejecutar cambio
    async with conn.transaction():
        await conn.execute(
            "CALL academ.sp_activar_periodo($1, $2)",
            periodo_id, UUID(user["sub"]),
        )

    return {"mensaje": f"Periodo '{periodo['nombre']}' activado correctamente.", "periodo_id": periodo_id}


@router.post("/{periodo_id}/cerrar")
async def cerrar_periodo(
    periodo_id: int,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_admin),
):
    """Cierra manualmente un periodo activo o próximo."""
    row = await conn.fetchrow(
        "SELECT estado FROM academ.periodo_academico WHERE id=$1", periodo_id
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Periodo no encontrado."})
    if row["estado"] == "cerrado":
        raise HTTPException(400, detail={"codigo": "YA_CERRADO", "mensaje": "El periodo ya está cerrado."})

    await conn.execute(
        "UPDATE academ.periodo_academico SET estado='cerrado', updated_at=NOW() WHERE id=$1",
        periodo_id,
    )
    return {"mensaje": "Periodo cerrado correctamente."}


@router.delete("/{periodo_id}", status_code=204)
async def eliminar_periodo(
    periodo_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """Elimina un periodo solo si no tiene grupos asociados."""
    tiene_grupos = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM academ.grupo WHERE periodo_id=$1)", periodo_id
    )
    if tiene_grupos:
        raise HTTPException(409, detail={
            "codigo": "PERIODO_CON_GRUPOS",
            "mensaje": "No se puede eliminar: el periodo tiene grupos asignados.",
        })
    res = await conn.execute("DELETE FROM academ.periodo_academico WHERE id=$1", periodo_id)
    if res == "DELETE 0":
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Periodo no encontrado."})
