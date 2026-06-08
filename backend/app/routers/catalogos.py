from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection, UniqueViolationError
from app.database import get_conn
from app.middleware.auth import require_admin, get_current_user
from app.schemas.docente import DocenteCreate, DocenteResponse
from app.schemas.materia import MateriaCreate, MateriaResponse
from app.schemas.unidad_plantilla import UnidadPlantillaCreate, UnidadPlantillaResponse
from app.schemas.carrera import CarreraCreate, CarreraResponse
from app.schemas.plan_estudio import PlanEstudioCreate, PlanEstudioResponse
from app.schemas.plan_materia import PlanMateriaCreate, PlanMateriaResponse
from app.schemas.prerrequisito import PrerrequisitoCreate, PrerrequisitoResponse
from app.helpers.materia_carrera import (
    resolver_celdas_carreras_materias_csv
)

router = APIRouter(tags=["Catálogos"])

# ── MATERIAS: listado enriquecido ─────────────────────────────────────────────

_SQL_MATERIA_LIST = """SELECT
               m.id, m.id AS materia_id, m.clave, m.nombre, m.creditos, m.horas_teoria, m.horas_practica, m.activa,
               (SELECT COUNT(*) FROM academ.unidad_plantilla up WHERE up.materia_id = m.id) as total_unidades,
               COALESCE(
                 (SELECT array_agg(DISTINCT pe.carrera_id)
                  FROM academ.plan_materia pm 
                  JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
                  WHERE pm.materia_id = m.id),
                 ARRAY[]::INT[]
               ) AS carreras_ids
           FROM academ.materia m"""


async def _fetch_materia_completa(conn: Connection, materia_id: int) -> dict | None:
    row = await conn.fetchrow(_SQL_MATERIA_LIST + " WHERE m.id = $1", materia_id)
    return dict(row) if row else None


@router.get("/materias/{materia_id}/vinculos")
async def listar_vinculos_materia(
    materia_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        """SELECT 
               pm.id, pm.clave, pm.semestre, pm.orden,
               pe.nombre AS plan_nombre, pe.id AS plan_id,
               c.nombre AS carrera_nombre, c.clave AS carrera_clave
           FROM academ.plan_materia pm
           JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
           JOIN academ.carrera c ON c.id = pe.carrera_id
           WHERE pm.materia_id = $1
           ORDER BY c.nombre, pm.semestre""",
        materia_id
    )
    return [dict(r) for r in rows]

# ── DOCENTES ──────────────────────────────────────────────────────────────────
# (Removidos: CRUD principal está en app.routers.docentes)


# ── MATERIAS ──────────────────────────────────────────────────────────────────

@router.get("/materias", response_model=list[MateriaResponse])
async def listar_materias(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(_SQL_MATERIA_LIST + " ORDER BY m.nombre")
    return [dict(r) for r in rows]


@router.post("/materias", status_code=201, response_model=MateriaResponse)
async def crear_materia(
    body: MateriaCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    print(f"DEBUG: Creando materia: {body.model_dump()}")
    try:
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO academ.materia (nombre, clave, creditos, horas_teoria, horas_practica) 
                   VALUES ($1, $2, $3, 0, 0) 
                   RETURNING id, nombre, clave, creditos, horas_teoria, horas_practica, activa""",
                body.nombre.strip(), body.clave.strip(), body.creditos,
            )
            materia_id = row["id"]

            if body.unidades:
                lista = [u.strip() for u in body.unidades.split("|") if u.strip()]
                for num, nom in enumerate(lista, start=1):
                    await conn.execute(
                        "INSERT INTO academ.unidad_plantilla (materia_id, numero, nombre) VALUES ($1,$2,$3)",
                        materia_id, num, nom
                    )



        completo = await _fetch_materia_completa(conn, materia_id)
        if not completo:
            raise HTTPException(500, detail={"codigo": "ERROR_INTERNO", "mensaje": "No se pudo leer la materia creada."})
        return completo
    except UniqueViolationError:
        raise HTTPException(409, detail={"codigo":"DUPLICADO","mensaje":"El nombre de la materia ya existe."})
    except Exception as e:
        print(f"ERROR CRÍTICO en crear_materia: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, detail={"codigo":"ERROR_INTERNO","mensaje": f"Error al procesar la materia: {str(e)}"})


@router.put("/materias/{materia_id}", response_model=MateriaResponse)
async def actualizar_materia(
    materia_id: int,
    body: MateriaCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):


    try:
        async with conn.transaction():
            row = await conn.fetchrow(
                """UPDATE academ.materia
                   SET nombre=$1, clave=$2, creditos=$3
                   WHERE id=$4
                   RETURNING id""",
                body.nombre.strip(), body.clave.strip(), body.creditos, materia_id,
            )
            if not row:
                raise HTTPException(404, detail={"codigo":"NO_ENCONTRADO","mensaje":"Materia no encontrada."})


        completo = await _fetch_materia_completa(conn, materia_id)
        if not completo:
            raise HTTPException(404, detail={"codigo":"NO_ENCONTRADO","mensaje":"Materia no encontrada."})
        return completo
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail={"codigo":"ERROR_ACTUALIZACION","mensaje": str(e)})

@router.delete("/materias/{materia_id}", status_code=204)
async def eliminar_materia(
    materia_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    # Baja lógica
    res = await conn.execute("UPDATE academ.materia SET activa=FALSE WHERE id=$1", materia_id)
    if res == "UPDATE 0":
        raise HTTPException(404, detail={"codigo":"NO_ENCONTRADO","mensaje":"Materia no encontrada."})

@router.post("/materias/{materia_id}/reactivar")
async def reactivar_materia(
    materia_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    await conn.execute("UPDATE academ.materia SET activa=TRUE WHERE id=$1", materia_id)
    return {"mensaje": "Materia reactivada"}


# ── PLANES DE ESTUDIO ──────────────────────────────────────────────────────────
@router.get("/planes", response_model=list[dict])
async def listar_todos_planes(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        """SELECT pe.id, pe.carrera_id, pe.nombre, pe.vigente, pe.created_at,
                  c.nombre as carrera_nombre, c.clave as carrera_clave
           FROM academ.plan_estudio pe
           JOIN academ.carrera c ON pe.carrera_id = c.id
           ORDER BY c.nombre, pe.created_at DESC"""
    )
    return [dict(r) for r in rows]

@router.get("/carreras/{carrera_id}/planes", response_model=list[PlanEstudioResponse])
async def listar_planes_carrera(
    carrera_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        "SELECT id, carrera_id, nombre, vigente, created_at FROM academ.plan_estudio WHERE carrera_id = $1 ORDER BY created_at DESC",
        carrera_id
    )
    return [dict(r) for r in rows]

@router.post("/planes", status_code=201, response_model=PlanEstudioResponse)
async def crear_plan(
    body: PlanEstudioCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    try:
        row = await conn.fetchrow(
            "INSERT INTO academ.plan_estudio (carrera_id, nombre, vigente) VALUES ($1, $2, $3) RETURNING *",
            body.carrera_id, body.nombre, body.vigente
        )
        return dict(row)
    except UniqueViolationError:
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": "Ya existe un plan de estudio con este nombre."})

@router.get("/planes/materias/todas")
async def listar_todas_materias_plan(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        """SELECT pm.id, pm.plan_estudio_id, pm.materia_id, pm.clave, pm.semestre, pm.orden, pm.obligatoria,
                  m.nombre as materia_nombre, m.creditos as creditos_base,
                  pe.nombre as plan_nombre, c.nombre as carrera_nombre
           FROM academ.plan_materia pm
           JOIN academ.materia m ON pm.materia_id = m.id
           JOIN academ.plan_estudio pe ON pm.plan_estudio_id = pe.id
           JOIN academ.carrera c ON pe.carrera_id = c.id
           ORDER BY c.nombre, pe.nombre, pm.semestre, pm.clave"""
    )
    return [dict(r) for r in rows]

@router.get("/planes/{plan_id}/materias")
async def listar_materias_plan(
    plan_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        """SELECT pm.id, pm.plan_estudio_id, pm.materia_id, pm.clave, pm.semestre, pm.orden, pm.obligatoria,
                  m.nombre as materia_nombre, m.creditos as creditos_base
           FROM academ.plan_materia pm
           JOIN academ.materia m ON pm.materia_id = m.id
           WHERE pm.plan_estudio_id = $1
           ORDER BY pm.semestre, pm.orden""",
        plan_id
    )
    return [dict(r) for r in rows]

# ── MAPA CURRICULAR (PLAN-MATERIA) ───────────────────────────────────────────
@router.post("/materias/{materia_id}/vincular-plan", status_code=201)
async def vincular_plan_materia(
    materia_id: int,
    body: PlanMateriaCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    try:
        async with conn.transaction():
            planes_destino = []
            if body.plan_estudio_id == 0:
                rows = await conn.fetch("SELECT id FROM academ.plan_estudio WHERE vigente = TRUE")
                planes_destino = [r["id"] for r in rows]
            else:
                planes_destino = [body.plan_estudio_id]

            for pid in planes_destino:
                clave_carrera = await conn.fetchval(
                    "SELECT c.clave FROM academ.carrera c JOIN academ.plan_estudio pe ON pe.carrera_id = c.id WHERE pe.id = $1",
                    pid
                )
                
                # 1. Calcular el ORDEN visual dentro del semestre (siempre consecutivo)
                orden_visual = await conn.fetchval(
                    "SELECT COALESCE(MAX(orden), 0) + 1 FROM academ.plan_materia WHERE plan_estudio_id = $1 AND semestre = $2",
                    pid, body.semestre
                )

                # 2. Calcular la CLAVE única dentro de todo el plan
                # Empezamos intentando con el orden visual, pero si ya existe en otro semestre, buscamos el siguiente sufijo disponible
                sufijo = orden_visual
                while True:
                    clave_auto = f"{body.semestre}{clave_carrera}{sufijo}"
                    exists = await conn.fetchval(
                        "SELECT 1 FROM academ.plan_materia WHERE plan_estudio_id = $1 AND clave = $2",
                        pid, clave_auto
                    )
                    if not exists:
                        break
                    sufijo += 1
                
                orden_auto = orden_visual # Usamos el consecutivo para el orden

                await conn.execute(
                    """INSERT INTO academ.plan_materia (plan_estudio_id, materia_id, clave, semestre, orden, obligatoria) 
                       VALUES ($1, $2, $3, $4, $5, $6)
                       ON CONFLICT (plan_estudio_id, materia_id) 
                       DO UPDATE SET semestre = EXCLUDED.semestre, obligatoria = EXCLUDED.obligatoria, orden = EXCLUDED.orden""",
                    pid, materia_id, clave_auto, body.semestre, orden_auto, body.obligatoria
                )
                
                # Normalizar orden del semestre destino
                rows = await conn.fetch(
                    "SELECT id FROM academ.plan_materia WHERE plan_estudio_id = $1 AND semestre = $2 ORDER BY orden, id",
                    pid, body.semestre
                )
                for i, r in enumerate(rows, start=1):
                    await conn.execute("UPDATE academ.plan_materia SET orden = $1 WHERE id = $2", i, r["id"])
    except Exception as e:
        print(f"DEBUG: Error vinculando materia: {e}")
        raise HTTPException(status_code=500, detail={"mensaje": "Error interno al procesar vinculación masiva."})
    
    return {"mensaje": "Vinculación procesada correctamente."}

@router.patch("/planes/materias/{pm_id}/posicion")
async def actualizar_posicion_materia(
    pm_id: int,
    body: dict, # {semestre, orden}
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    async with conn.transaction():
        # Obtener el plan_id para normalizar después
        plan_id = await conn.fetchval("SELECT plan_estudio_id FROM academ.plan_materia WHERE id = $1", pm_id)
        old_sem = await conn.fetchval("SELECT semestre FROM academ.plan_materia WHERE id = $1", pm_id)
        
        await conn.execute(
            "UPDATE academ.plan_materia SET semestre = $1, orden = $2 WHERE id = $3",
            body.get("semestre"), body.get("orden"), pm_id
        )

        # Normalizar semestre destino
        rows_dest = await conn.fetch(
            "SELECT id FROM academ.plan_materia WHERE plan_estudio_id = $1 AND semestre = $2 ORDER BY orden, id",
            plan_id, body.get("semestre")
        )
        for i, r in enumerate(rows_dest, start=1):
            await conn.execute("UPDATE academ.plan_materia SET orden = $1 WHERE id = $2", i, r["id"])
            
        # Normalizar semestre origen si es distinto
        if old_sem != body.get("semestre"):
            rows_orig = await conn.fetch(
                "SELECT id FROM academ.plan_materia WHERE plan_estudio_id = $1 AND semestre = $2 ORDER BY orden, id",
                plan_id, old_sem
            )
            for i, r in enumerate(rows_orig, start=1):
                await conn.execute("UPDATE academ.plan_materia SET orden = $1 WHERE id = $2", i, r["id"])
    return {"mensaje": "Posición actualizada"}

@router.delete("/materias/{materia_id}/desvincular-plan/{plan_id}")
async def desvincular_materia(
    materia_id: int,
    plan_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    await conn.execute(
        "DELETE FROM academ.plan_materia WHERE materia_id = $1 AND plan_estudio_id = $2",
        materia_id, plan_id
    )
    return {"mensaje": "Materia desvinculada del plan"}

# ── PRERREQUISITOS ────────────────────────────────────────────────────────────

@router.get("/planes/materias/{pm_id}/prerrequisitos", response_model=list[PrerrequisitoResponse])
async def listar_prerrequisitos(
    pm_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        """SELECT p.*, 
                  m_dest.nombre as materia_nombre, 
                  m_req.nombre as requisito_nombre,
                  pm_req.clave as requisito_clave
           FROM academ.prerrequisito p
           JOIN academ.plan_materia pm_dest ON pm_dest.id = p.plan_materia_id
           JOIN academ.materia m_dest ON m_dest.id = pm_dest.materia_id
           JOIN academ.plan_materia pm_req ON pm_req.id = p.requisito_id
           JOIN academ.materia m_req ON m_req.id = pm_req.materia_id
           WHERE p.plan_materia_id = $1""",
        pm_id
    )
    return [dict(r) for r in rows]

@router.post("/planes/materias/{pm_id}/prerrequisitos", response_model=PrerrequisitoResponse)
async def agregar_prerrequisito(
    pm_id: int,
    body: PrerrequisitoCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    try:
        pr_id = await conn.fetchval(
            """INSERT INTO academ.prerrequisito (plan_materia_id, requisito_id, activo)
               VALUES ($1, $2, $3)
               RETURNING id""",
            pm_id, body.requisito_id, body.activo
        )
        
        row = await conn.fetchrow(
            """SELECT p.*, 
                      m_dest.nombre as materia_nombre, 
                      m_req.nombre as requisito_nombre,
                      pm_req.clave as requisito_clave
               FROM academ.prerrequisito p
               JOIN academ.plan_materia pm_dest ON pm_dest.id = p.plan_materia_id
               JOIN academ.materia m_dest ON m_dest.id = pm_dest.materia_id
               JOIN academ.plan_materia pm_req ON pm_req.id = p.requisito_id
               JOIN academ.materia m_req ON m_req.id = pm_req.materia_id
               WHERE p.id = $1""",
            pr_id
        )
        return dict(row)
    except UniqueViolationError:
        raise HTTPException(status_code=400, detail={"codigo": "DUPLICADO", "mensaje": "Este prerrequisito ya existe"})
    except Exception as e:
        if 'Conflicto de Plan' in str(e):
            raise HTTPException(status_code=400, detail={"codigo": "ERROR", "mensaje": str(e)})
        raise HTTPException(status_code=500, detail=f"Error al crear prerrequisito: {e}")

@router.delete("/planes/materias/prerrequisitos/{pr_id}")
async def eliminar_prerrequisito(
    pr_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    await conn.execute("DELETE FROM academ.prerrequisito WHERE id = $1", pr_id)
    return {"mensaje": "Prerrequisito eliminado"}



# ── UNIDADES PLANTILLA (por materia) ───────────────────────────────────────────

@router.get("/materias/{materia_id}/unidades", response_model=list[UnidadPlantillaResponse])
async def listar_unidades_plantilla(
    materia_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        "SELECT id,materia_id,numero,nombre FROM academ.unidad_plantilla WHERE materia_id=$1 ORDER BY numero",
        materia_id,
    )
    return [dict(r) for r in rows]


@router.post("/materias/{materia_id}/unidades", status_code=201, response_model=UnidadPlantillaResponse)
async def crear_unidad_plantilla(
    materia_id: int,
    body: UnidadPlantillaCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    # Verificar que la materia existe
    existe = await conn.fetchval("SELECT 1 FROM academ.materia WHERE id=$1", materia_id)
    if not existe:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Materia no encontrada."})
    try:
        row = await conn.fetchrow(
            "INSERT INTO academ.unidad_plantilla (materia_id,numero,nombre) VALUES ($1,$2,$3) RETURNING id,materia_id,numero,nombre",
            materia_id, body.numero, body.nombre,
        )
    except UniqueViolationError:
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": f"Ya existe la unidad número {body.numero} para esta materia."})
    return dict(row)

@router.put("/materias/{materia_id}/unidades/{unidad_id}", response_model=UnidadPlantillaResponse)
async def actualizar_unidad_plantilla(
    materia_id: int,
    unidad_id: int,
    body: UnidadPlantillaCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    row = await conn.fetchrow(
        "UPDATE academ.unidad_plantilla SET numero=$1, nombre=$2 WHERE id=$3 AND materia_id=$4 RETURNING id,materia_id,numero,nombre",
        body.numero, body.nombre, unidad_id, materia_id,
    )
    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Unidad plantilla no encontrada."})
    return dict(row)


@router.delete("/materias/{materia_id}/unidades/{unidad_id}", status_code=204)
async def eliminar_unidad_plantilla(
    materia_id: int,
    unidad_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    res = await conn.execute(
        "DELETE FROM academ.unidad_plantilla WHERE id=$1 AND materia_id=$2",
        unidad_id, materia_id,
    )
    if res == "DELETE 0":
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Unidad plantilla no encontrada."})


# ── TIPOS DE ACTIVIDAD (catálogo gestionado por Admin) ─────────────────────────

@router.get("/tipos-actividad")
async def listar_tipos_actividad(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        """SELECT id, nombre, descripcion, valor_ponderacion_sugerido, activo, created_at, updated_at
           FROM academ.tipo_actividad_catalogo
           ORDER BY nombre"""
    )
    return [dict(r) for r in rows]


@router.post("/tipos-actividad", status_code=201)
async def crear_tipo_actividad(
    nombre: str,
    descripcion: str = None,
    valor_ponderacion_sugerido: float = None,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    try:
        row = await conn.fetchrow(
            """INSERT INTO academ.tipo_actividad_catalogo (nombre, descripcion, valor_ponderacion_sugerido)
               VALUES ($1, $2, $3)
               RETURNING id, nombre, descripcion, valor_ponderacion_sugerido, activo""",
            nombre, descripcion, valor_ponderacion_sugerido,
        )
    except UniqueViolationError:
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": "Ya existe un tipo de actividad con ese nombre."})
    return dict(row)


@router.put("/tipos-actividad/{tipo_id}")
async def actualizar_tipo_actividad(
    tipo_id: int,
    nombre: str = None,
    descripcion: str = None,
    valor_ponderacion_sugerido: float = None,
    activo: bool = None,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    campos = {}
    if nombre is not None: campos["nombre"] = nombre
    if descripcion is not None: campos["descripcion"] = descripcion
    if valor_ponderacion_sugerido is not None: campos["valor_ponderacion_sugerido"] = valor_ponderacion_sugerido
    if activo is not None: campos["activo"] = activo

    if not campos:
        raise HTTPException(422, detail={"codigo": "SIN_CAMBIOS", "mensaje": "No se enviaron campos a actualizar."})

    set_clause = ", ".join(f"{k}=${i+2}" for i, k in enumerate(campos))
    values = list(campos.values())

    try:
        row = await conn.fetchrow(
            f"""UPDATE academ.tipo_actividad_catalogo SET {set_clause}, updated_at=NOW()
                WHERE id=$1
                RETURNING id, nombre, descripcion, valor_ponderacion_sugerido, activo""",
            tipo_id, *values,
        )
    except UniqueViolationError:
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": "Ya existe otro tipo con ese nombre."})

    if not row:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Tipo de actividad no encontrado."})
    return dict(row)


@router.delete("/tipos-actividad/{tipo_id}", status_code=204)
async def eliminar_tipo_actividad(
    tipo_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    """Desactiva un tipo de actividad. No se puede eliminar si tiene actividades asociadas."""
    tiene_actividades = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM academ.actividad WHERE tipo_catalogo_id=$1)", tipo_id
    )
    if tiene_actividades:
        # Solo desactivar, no eliminar
        await conn.execute(
            "UPDATE academ.tipo_actividad_catalogo SET activo=FALSE, updated_at=NOW() WHERE id=$1", tipo_id
        )
        return
    res = await conn.execute("DELETE FROM academ.tipo_actividad_catalogo WHERE id=$1", tipo_id)
    if res == "DELETE 0":
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Tipo de actividad no encontrado."})


# ── CARRERAS ──────────────────────────────────────────────────────────────────

@router.get("/carreras", response_model=list[CarreraResponse])
async def listar_carreras(
    conn: Connection = Depends(get_conn),
    _: dict = Depends(get_current_user),
):
    rows = await conn.fetch(
        "SELECT id, clave, nombre, descripcion, activo, created_at FROM academ.carrera ORDER BY nombre"
    )
    return [dict(r) for r in rows]


@router.post("/carreras", status_code=201, response_model=CarreraResponse)
async def crear_carrera(
    body: CarreraCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    try:
        row = await conn.fetchrow(
            "INSERT INTO academ.carrera (clave, nombre, descripcion, activo) VALUES ($1, $2, $3, $4) RETURNING *",
            body.clave.strip().upper(), body.nombre.strip(), body.descripcion, body.activo
        )
    except UniqueViolationError:
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": "La clave de la carrera ya existe."})
    return dict(row)


@router.put("/carreras/{carrera_id}", response_model=CarreraResponse)
async def actualizar_carrera(
    carrera_id: int,
    body: CarreraCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    try:
        row = await conn.fetchrow(
            """UPDATE academ.carrera SET clave=$1, nombre=$2, descripcion=$3, activo=$4 
               WHERE id=$5 RETURNING *""",
            body.clave.strip().upper(), body.nombre.strip(), body.descripcion, body.activo, carrera_id
        )
        if not row:
            raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Carrera no encontrada."})
    except UniqueViolationError:
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": "La clave de la carrera ya existe."})
    return dict(row)


@router.get("/materias/{materia_id}/analytics")
async def obtener_analytics_materia(
    materia_id: int,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin)
):
    stats = await conn.fetchrow(
        """SELECT
            COUNT(DISTINCT g.id) as total_grupos,
            ROUND(AVG(rm.resultado_final)::numeric, 2) as promedio_global,
            COUNT(DISTINCT i.alumno_id) as total_alumnos_historico
        FROM academ.grupo g
        LEFT JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
        LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
        WHERE g.materia_id = $1""",
        materia_id
    )
    
    historial = await conn.fetch(
        """SELECT
            p.codigo as periodo,
            g.nombre as grupo,
            COUNT(rm.id) as total_alumnos,
            COUNT(rm.id) FILTER (WHERE rm.resultado_final >= 70) as aprobados,
            ROUND(AVG(rm.resultado_final)::numeric, 2) as promedio_grupo
        FROM academ.grupo g
        JOIN academ.periodo_academico p ON p.id = g.periodo_id
        LEFT JOIN academ.inscripcion i ON i.grupo_id = g.id AND i.estado = 'ACTIVA'
        LEFT JOIN academ.resultado_materia rm ON rm.inscripcion_id = i.id
        WHERE g.materia_id = $1
        GROUP BY g.id, p.id, p.codigo, g.nombre
        ORDER BY p.id ASC
        LIMIT 20""",
        materia_id
    )
    
    return {
        "stats": {
            "total_grupos": stats["total_grupos"] or 0,
            "promedio_global": float(stats["promedio_global"] or 0),
            "total_alumnos_historico": stats["total_alumnos_historico"] or 0
        },
        "historial": [dict(h) for h in historial]
    }
