import json
import traceback
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.encoders import jsonable_encoder
from asyncpg import Connection
from datetime import date
from uuid import UUID

from app.database import get_conn
from app.middleware.auth import require_admin, get_current_user, require_docente_o_admin, is_alumno
from app.auth.authorization import assert_can_manage_group, assert_can_read_enrollment
from app.schemas.inscripcion import InscripcionCreate

router = APIRouter(tags=["Inscripciones"])

@router.get("/mis-grupos")
async def mis_grupos(
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    """
    Exclusivo para alumnos: devuelve sus grupos con inscripcion_id incluido
    para que puedan consultar su desglose y resultados.
    """
    if not is_alumno(user):
        raise HTTPException(403, detail={"codigo": "SIN_PERMISO", "mensaje": "Solo disponible para alumnos."})
 
    try:
        # Usamos columnas explícitas para evitar conflictos (ambos tienen resultado_final)
        rows = await conn.fetch(
            """
            SELECT i.alumno_id, g.id AS grupo_id, g.nombre, g.estado, g.calificacion_maxima,
                   m.nombre AS materia, i.id AS inscripcion_id, i.estado AS estado_inscripcion, g.periodo_id, d.nombre || ' ' || d.apellido_pat AS docente,
                   calc.resultado_final, calc.unidades_con_result 
            FROM academ.inscripcion i 
            JOIN academ.grupo g ON g.id = i.grupo_id
            JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
            JOIN academ.materia m ON m.id = pm.materia_id
            LEFT JOIN academ.docente d ON d.id = g.docente_id
            LEFT JOIN LATERAL academ.fn_calcular_resultado_materia(i.id) calc ON true 
            WHERE i.alumno_id = $1 AND i.estado = 'ACTIVA'
            """,
            user["id_entidad"],
        )
        return [dict(r) for r in rows]
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, detail={"codigo": "ERROR_QUERY", "mensaje": str(e)})

@router.post("/grupos/{grupo_id}/inscripciones", status_code=201)
async def inscribir_alumno(
    grupo_id: UUID,
    body: InscripcionCreate,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    fecha = body.fecha_inscripcion or date.today()
    
    # Comprobar estado actual de inscripción si existe
    existente = await conn.fetchrow(
        "SELECT estado FROM academ.inscripcion WHERE alumno_id=$1 AND grupo_id=$2",
        body.alumno_id, grupo_id
    )
    if existente:
        if existente["estado"] == "BAJA":
            raise HTTPException(409, detail={"codigo": "VETADO", "mensaje": "Alumno Vetado. No puede volver a inscribirse tras una baja."})
        else:
            raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": "El alumno ya está activo en este grupo."})

    # No inscribir si hay alguna unidad cerrada
    unidad_cerrada = await conn.fetchval(
        "SELECT 1 FROM academ.unidad WHERE grupo_id=$1 AND estado != 'EDICION' LIMIT 1",
        grupo_id
    )
    if unidad_cerrada:
        raise HTTPException(409, detail={"codigo": "UNIDAD_EVALUADA", "mensaje": "No se puede inscribir al alumno porque el grupo ya cuenta con unidades evaluadas."})

    grupo_info = await conn.fetchrow(
        """SELECT g.periodo_id, pe.carrera_id, c.nombre AS carrera_nombre
           FROM academ.grupo g
           JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
           JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
           JOIN academ.carrera c ON c.id = pe.carrera_id
           WHERE g.id=$1""", grupo_id
    )
    periodo_id = grupo_info["periodo_id"]
    carrera_grupo_id = grupo_info["carrera_id"]

    # Validar carrera del alumno
    carrera_alumno = await conn.fetchval(
        """SELECT pe.carrera_id 
           FROM academ.alumno a
           JOIN academ.plan_estudio pe ON pe.id = a.plan_estudio_id
           WHERE a.id=$1""", body.alumno_id
    )
    if carrera_alumno != carrera_grupo_id:
        raise HTTPException(
            status_code=409, 
            detail={"codigo": "CARRERA_INCOMPATIBLE", "mensaje": f"El alumno no pertenece a la carrera del grupo ({grupo_info['carrera_nombre']})."}
        )

    horarios_nuevo = await conn.fetch(
        """SELECT dia_semana, hora_inicio, hora_fin FROM academ.horario_grupo WHERE grupo_id = $1""",
        grupo_id
    )
    if horarios_nuevo:
        solapamientos_alu = []
        for hn in horarios_nuevo:
            conflicto_alu = await conn.fetchrow(
                """SELECT g.nombre AS grupo_nombre,
                          hg.hora_inicio, hg.hora_fin
                   FROM academ.inscripcion i
                   JOIN academ.horario_grupo hg ON hg.grupo_id = i.grupo_id
                   JOIN academ.grupo g ON g.id = i.grupo_id
                   WHERE i.alumno_id = $1
                     AND i.estado = 'ACTIVA'
                     AND g.periodo_id = $2
                     AND hg.dia_semana = $3
                     AND hg.hora_inicio < $5
                     AND hg.hora_fin > $4""",
                body.alumno_id, periodo_id, hn['dia_semana'], hn['hora_inicio'], hn['hora_fin']
            )
            if conflicto_alu:
                DIAS_LABEL = {1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves",
                              5: "Viernes", 6: "Sábado", 7: "Domingo"}
                dia_label = DIAS_LABEL.get(hn['dia_semana'], f"Día {hn['dia_semana']}")
                hi = str(conflicto_alu['hora_inicio'])[:5]
                hf = str(conflicto_alu['hora_fin'])[:5]
                solapamientos_alu.append(
                    f"{dia_label}: ya está inscrito en '{conflicto_alu['grupo_nombre']}' de {hi} a {hf}"
                )
        if solapamientos_alu:
            raise HTTPException(
                status_code=409,
                detail={
                    "codigo": "SOLAPAMIENTO_ALUMNO",
                    "mensaje": "El alumno tiene un conflicto de horario:\n• " + "\n• ".join(solapamientos_alu)
                }
            )

    try:
        row = await conn.fetchrow(
            "INSERT INTO academ.inscripcion (alumno_id,grupo_id,fecha_inscripcion) VALUES ($1,$2,$3) RETURNING id,alumno_id,grupo_id,fecha_inscripcion,estado",
            body.alumno_id, grupo_id, fecha,
        )
    except Exception:
        raise HTTPException(409, detail={"codigo": "DUPLICADO", "mensaje": "El alumno ya está inscrito en este grupo."})
    return dict(row)

@router.post("/grupos/{grupo_id}/importar-csv")
async def importar_inscripciones_csv(
    grupo_id: UUID,
    archivo: UploadFile = File(..., description="CSV con 1 columna: no_control"),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    try:
        content = await archivo.read()
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = content.decode("latin-1")
            
        import csv
        import io
        reader = csv.DictReader(io.StringIO(text))
        filas = [{k.strip().lower(): (v.strip() if v else None) for k, v in row.items()} for row in reader]
    except Exception as e:
        raise HTTPException(400, detail={"codigo": "CSV_INVALIDO", "mensaje": "No se pudo leer el archivo CSV."})

    ins = omit = 0
    errores = []

    # Verificar si hay unidad cerrada
    unidad_cerrada = await conn.fetchval(
        "SELECT 1 FROM academ.unidad WHERE grupo_id=$1 AND estado != 'EDICION' LIMIT 1",
        grupo_id
    )
    if unidad_cerrada:
        raise HTTPException(409, detail={"codigo": "UNIDAD_EVALUADA", "mensaje": "El grupo ya cuenta con unidades evaluadas."})

    grupo_info = await conn.fetchrow(
        """SELECT g.periodo_id, pe.carrera_id, c.nombre AS carrera_nombre
           FROM academ.grupo g
           JOIN academ.plan_materia pm ON pm.id = g.plan_materia_id
           JOIN academ.plan_estudio pe ON pe.id = pm.plan_estudio_id
           JOIN academ.carrera c ON c.id = pe.carrera_id
           WHERE g.id=$1""", grupo_id
    )
    periodo_id = grupo_info["periodo_id"]
    carrera_grupo_id = grupo_info["carrera_id"]

    # Pre-cargar el horario del grupo UNA VEZ para evitar N queries dentro del loop
    DIAS_LABEL_CSV = {1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves",
                      5: "Viernes", 6: "Sábado", 7: "Domingo"}
    horarios_grupo = await conn.fetch(
        "SELECT dia_semana, hora_inicio, hora_fin FROM academ.horario_grupo WHERE grupo_id = $1",
        grupo_id
    )

    for i, fila in enumerate(filas, start=2):
        identificador = fila.get("no_control") or fila.get("matricula") or fila.get("num_control")
        if not identificador:
            errores.append({"fila": i, "error": "Falta columna 'no_control'."})
            continue
            
        # Buscar alumno y su carrera
        alumno_info = await conn.fetchrow(
            """SELECT a.id, pe.carrera_id 
               FROM academ.alumno a
               LEFT JOIN academ.plan_estudio pe ON pe.id = a.plan_estudio_id
               WHERE a.no_control=$1""", identificador
        )
        if not alumno_info:
            errores.append({"fila": i, "error": f"Alumno con identificador '{identificador}' no existe."})
            continue
            
        if alumno_info["carrera_id"] != carrera_grupo_id:
            errores.append({"fila": i, "error": f"El alumno no pertenece a la carrera del grupo ({grupo_info['carrera_nombre']})."})
            continue
            
        alumno_id = alumno_info["id"]
        try:
            # Comprobar estado actual de inscripción si existe
            existente = await conn.fetchrow(
                "SELECT estado FROM academ.inscripcion WHERE alumno_id=$1 AND grupo_id=$2",
                alumno_id, grupo_id
            )
            if existente:
                if existente["estado"] == "BAJA":
                    errores.append({"fila": i, "error": f"Alumno '{identificador}' Vetado (Baja previa)."})
                else:
                    omit += 1
                continue

            # Validar solapamiento de horario del alumno
            solapamiento_encontrado = None
            for hn in horarios_grupo:
                conflicto = await conn.fetchrow(
                    """SELECT g.nombre AS grupo_nombre, hg.hora_inicio, hg.hora_fin, hg.dia_semana
                       FROM academ.inscripcion ins
                       JOIN academ.horario_grupo hg ON hg.grupo_id = ins.grupo_id
                       JOIN academ.grupo g ON g.id = ins.grupo_id
                       WHERE ins.alumno_id = $1
                         AND ins.estado = 'ACTIVA'
                         AND g.periodo_id = $2
                         AND hg.dia_semana = $3
                         AND hg.hora_inicio < $5
                         AND hg.hora_fin > $4""",
                    alumno_id, periodo_id, hn['dia_semana'], hn['hora_inicio'], hn['hora_fin']
                )
                if conflicto:
                    dia_label = DIAS_LABEL_CSV.get(hn['dia_semana'], f"Día {hn['dia_semana']}")
                    hi = str(conflicto['hora_inicio'])[:5]
                    hf = str(conflicto['hora_fin'])[:5]
                    solapamiento_encontrado = (
                        f"{dia_label}: ya inscrito en '{conflicto['grupo_nombre']}' de {hi} a {hf}"
                    )
                    break
            if solapamiento_encontrado:
                errores.append({"fila": i, "error": f"Conflicto de horario — {solapamiento_encontrado}"})
                continue

            result = await conn.execute(
                "INSERT INTO academ.inscripcion (alumno_id,grupo_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
                alumno_id, grupo_id
            )
            if result == "INSERT 0 1": ins += 1
            else: omit += 1
        except Exception as e:
            errores.append({"fila": i, "error": str(e)})

    return {"insertados": ins, "omitidos": omit, "errores": errores, "total": ins + omit + len(errores)}



@router.get("/grupos/{grupo_id}/inscripciones")
async def listar_inscripciones(
    grupo_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(require_docente_o_admin),
):
    await assert_can_manage_group(conn, user, grupo_id)
    rows = await conn.fetch(
        """SELECT i.id, i.alumno_id, i.grupo_id, i.fecha_inscripcion, i.estado,
                  a.nombre || ' ' || a.apellido_pat || ' ' || COALESCE(a.apellido_mat, '') AS alumno_nombre,
                  a.no_control AS alumno_no_control
           FROM academ.inscripcion i
           JOIN academ.alumno a ON a.id=i.alumno_id
           WHERE i.grupo_id=$1 ORDER BY a.apellido_pat""",
        grupo_id,
    )
    return [dict(r) for r in rows]


@router.delete("/inscripciones/{inscripcion_id}")
async def dar_baja(
    inscripcion_id: UUID,
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    insc = await conn.fetchrow(
        "SELECT id, grupo_id FROM academ.inscripcion WHERE id=$1", inscripcion_id
    )
    if not insc:
        raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "Inscripción no encontrada."})

    row = await conn.fetchrow(
        "UPDATE academ.inscripcion SET estado='BAJA' WHERE id=$1 RETURNING id,estado",
        inscripcion_id,
    )
    return {"mensaje": "Inscripción dada de baja.", "id": row["id"]}

@router.get("/inscripciones/{inscripcion_id}/desglose")
async def obtener_desglose(
    inscripcion_id: UUID,
    conn: Connection = Depends(get_conn),
    user: dict = Depends(get_current_user),
):
    try:
        await assert_can_read_enrollment(conn, user, inscripcion_id)
        
        # Obtener desglose
        json_res = await conn.fetchval(
            "SELECT academ.fn_desglose_alumno($1::uuid)", 
            inscripcion_id
        )
        if not json_res:
            raise HTTPException(404, detail={"codigo": "NO_ENCONTRADO", "mensaje": "No se encontró información del desglose."})
        
        # Asegurar serialización limpia (maneja UUID, Decimal, etc.)
        data = json.loads(json_res) if isinstance(json_res, str) else json_res
        return jsonable_encoder(data)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        # Proporcionar un poco más de contexto en el error si es posible
        msg = str(e)
        raise HTTPException(500, detail={"codigo": "ERROR_INTERNO", "mensaje": f"Error interno al procesar el desglose: {msg}"})
