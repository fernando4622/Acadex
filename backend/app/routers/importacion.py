"""
Carga masiva de datos desde archivos CSV.

Flujo para cada entidad:
  1. El cliente sube un archivo CSV con POST multipart/form-data
  2. El backend lo parsea, valida fila a fila
  3. Intenta insertar cada fila en una transacción independiente
  4. Devuelve resumen: insertados, omitidos (ya existían), errores con detalle por fila

Formato esperado de cada CSV:
  alumnos.csv      → no_control, nombre, apellido_pat, apellido_mat (opc), email (opc)
  materias.csv     → clave, nombre, creditos (opc), unidades (opc, nombres con |)
  grupos.csv       → clave_materia debe coincidir con academ.materia.clave; si la materia
                     tiene más de una carrera, usar columna carrera o carrera_clave
  inscripciones.csv→ no_control + nombre_grupo
"""
import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from asyncpg import Connection

from app.database import get_conn
from app.middleware.auth import require_admin
from app.helpers.plan_materia import resolver_grupo_desde_clave_materia
from app.routers.docentes import generar_email_docente, hash_password
from app.schemas.docente import DocenteImportPreview
from app.schemas.alumno import AlumnoImportPreview

router = APIRouter(prefix="/importar", tags=["Importación CSV"])


def generar_email_alumno(matricula: str) -> str:
    """Genera el correo institucional para alumnos: L + matricula + @veracruz.tecnm.mx"""
    return f"L{matricula.upper()}@veracruz.tecnm.mx"


def generar_password_alumno(fecha_nac) -> str:
    """Genera el NIP provisional (YYYYMMDD)."""
    return fecha_nac.strftime("%Y%m%d")


def parsear_fecha_nacimiento(valor: str):
    """Convierte los formatos CSV admitidos a una fecha o devuelve None."""
    if not valor:
        return None
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(valor, formato).date()
        except ValueError:
            continue
    return None


def _parse_csv(content: bytes) -> list[dict]:
    """Decodifica el CSV y devuelve lista de dicts. Acepta UTF-8 y latin-1."""
    try:
        text = content.decode("utf-8-sig")   # utf-8-sig maneja BOM de Excel
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    return [
        {k.strip().lower(): (v.strip() if v else None) for k, v in row.items() if k is not None}
        for row in reader
    ]


def _resultado(insertados: int, omitidos: int, errores: list) -> dict:
    return {
        "insertados": insertados,
        "omitidos":   omitidos,
        "errores":    errores,
        "total":      insertados + omitidos + len(errores),
    }


@router.post("/alumnos/preview", response_model=list[AlumnoImportPreview])
async def preview_alumnos(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    results = []

    matriculas_existentes = {r["no_control"] for r in await conn.fetch("SELECT no_control FROM academ.alumno")}
    emails_existentes = {r["email"] for r in await conn.fetch("SELECT email FROM academ.usuario")}
    matriculas_csv = set()
    emails_csv = set()

    # Preparar secuencia para matrículas auto-generadas
    from datetime import datetime
    año = datetime.now().year % 100
    ultimo_val = await conn.fetchval(
        "SELECT MAX(CAST(no_control AS BIGINT)) FROM academ.alumno WHERE no_control ~ '^[0-9]+$' AND no_control LIKE $1",
        f"{año}%"
    )
    if ultimo_val:
        secuencia_actual = ultimo_val + 1
    else:
        # Formato YY020001 (ej. 26020001)
        secuencia_actual = int(f"{año}020001")

    for i, fila in enumerate(filas, start=1):
        matricula = fila.get("no_control") or fila.get("matricula") or fila.get("numero_control") or fila.get("num_control")
        if not matricula:
            matricula = str(secuencia_actual)
            secuencia_actual += 1

        nombre    = fila.get("nombre")
        ap_pat    = fila.get("apellido_pat")
        ap_mat    = fila.get("apellido_mat")
        fecha_nac_str = (fila.get("fecha_nacimiento") or fila.get("fecha") or "").strip()
        curp      = fila.get("curp")

        # Generar email/nip para preview
        email_preview = fila.get("email") or (generar_email_alumno(matricula) if matricula else None)
        
        fecha_nac = parsear_fecha_nacimiento(fecha_nac_str)
        nip_preview = generar_password_alumno(fecha_nac) if fecha_nac else None

        # Revisar si existe por CURP (Sincronización con el fix de duplicados)
        ya_existe = False
        if curp:
            curp_clean = curp.strip().upper()
            existe_id = await conn.fetchval("SELECT id FROM academ.alumno WHERE curp = $1", curp_clean)
            if existe_id:
                ya_existe = True

        # Validaciones de error
        error = None
        if not matricula: error = "Matrícula/No. Control es obligatorio"
        elif not nombre: error = "Nombre es obligatorio"
        elif not ap_pat: error = "Apellido Paterno es obligatorio"
        elif not fecha_nac_str: error = "Fecha de nacimiento es obligatoria para generar el NIP provisional"
        elif not fecha_nac: error = "Fecha de nacimiento inválida"
        elif matricula in matriculas_existentes: error = f"Matrícula {matricula} ya existe"
        elif matricula in matriculas_csv: error = f"Matrícula {matricula} duplicada en CSV"
        elif email_preview and email_preview in emails_existentes: error = f"Email {email_preview} ya está en uso"
        elif email_preview and email_preview in emails_csv: error = f"Email {email_preview} duplicado en CSV"

        if matricula: matriculas_csv.add(matricula)
        if email_preview: emails_csv.add(email_preview)

        results.append(AlumnoImportPreview(
            fila=i, no_control=matricula, nombre=nombre or "ERROR",
            apellido_pat=ap_pat or "ERROR", apellido_mat=ap_mat,
            fecha_nacimiento=fecha_nac_str, email=email_preview,
            curp=curp, nip_provisional=nip_preview,
            error=error,
            ya_existe=ya_existe
        ))
    return results


@router.post("/alumnos/confirmar")
async def confirmar_importar_alumnos(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    ins = omit = 0
    resultados = []
    errores = []

    # Obtener existentes para saltar
    matriculas_existentes = {r["no_control"] for r in await conn.fetch("SELECT no_control FROM academ.alumno")}
    emails_existentes = {r["email"] for r in await conn.fetch("SELECT email FROM academ.usuario")}

    # Preparar secuencia para matrículas auto-generadas
    año = datetime.now().year % 100
    ultimo_val = await conn.fetchval(
        "SELECT MAX(CAST(no_control AS BIGINT)) FROM academ.alumno WHERE no_control ~ '^[0-9]+$' AND no_control LIKE $1",
        f"{año}%"
    )
    if ultimo_val:
        secuencia_actual = ultimo_val + 1
    else:
        secuencia_actual = int(f"{año}020001")

    for i, fila in enumerate(filas, start=1):
        matricula = fila.get("no_control") or fila.get("matricula") or fila.get("numero_control") or fila.get("num_control")
        if not matricula:
            matricula = str(secuencia_actual)
            secuencia_actual += 1

        nombre    = fila.get("nombre")
        ap_pat    = fila.get("apellido_pat")
        ap_mat    = fila.get("apellido_mat")
        fecha_nac_str = (fila.get("fecha_nacimiento") or fila.get("fecha") or "").strip()
        curp      = (fila.get("curp") or "").strip().upper() or None
        plan_id   = fila.get("plan_estudio_id") or fila.get("plan_id")

        if not matricula or not nombre or not ap_pat:
            errores.append({"fila": i, "error": "Faltan campos obligatorios"})
            continue

        if matricula in matriculas_existentes:
            errores.append({"fila": i, "error": f"Matrícula {matricula} ya registrada (Omitido)"})
            continue

        try:
            fecha_nac = parsear_fecha_nacimiento(fecha_nac_str)
            if not fecha_nac:
                errores.append({
                    "fila": i,
                    "error": "Fecha de nacimiento obligatoria o inválida; no se generaron credenciales",
                })
                continue

            plan_estudio_id = None
            if plan_id:
                try:
                    plan_estudio_id = int(plan_id)
                except (TypeError, ValueError):
                    raise ValueError("plan_estudio_id debe ser un número entero")
                if plan_estudio_id <= 0:
                    raise ValueError("plan_estudio_id debe ser mayor que cero")
                plan_existe = await conn.fetchval(
                    "SELECT id FROM academ.plan_estudio WHERE id=$1",
                    plan_estudio_id,
                )
                if not plan_existe:
                    raise ValueError(f"Plan de estudios {plan_estudio_id} no existe")

            # Generación de credenciales
            email_inst = fila.get("email") or generar_email_alumno(matricula)
            
            if email_inst in emails_existentes:
                errores.append({"fila": i, "error": f"Email {email_inst} ya está en uso (Omitido)"})
                continue

            pw_texto = generar_password_alumno(fecha_nac)
            pw_hashed = hash_password(pw_texto)

            # Revisar si existe por CURP (Fix para evitar errores de unicidad)
            if curp:
                existe_id = await conn.fetchval("SELECT id FROM academ.alumno WHERE curp = $1", curp)
                if existe_id:
                    omit += 1
                    continue

            async with conn.transaction():
                # 1. Usuario
                usuario_id = await conn.fetchval(
                    "INSERT INTO academ.usuario (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id",
                    email_inst, pw_hashed
                )

                # 2. Rol
                rol_id = await conn.fetchval("SELECT id FROM academ.rol WHERE nombre='ALUMNO'")
                if rol_id:
                    await conn.execute("INSERT INTO academ.usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", usuario_id, rol_id)

                # 3. Alumno
                await conn.execute(
                    """
                    INSERT INTO academ.alumno (no_control, nombre, apellido_pat, apellido_mat, fecha_nacimiento, email, curp, plan_estudio_id, usuario_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                    ON CONFLICT (no_control) DO UPDATE SET
                        nombre=EXCLUDED.nombre, apellido_pat=EXCLUDED.apellido_pat, 
                        apellido_mat=EXCLUDED.apellido_mat, fecha_nacimiento=EXCLUDED.fecha_nacimiento, 
                        email=EXCLUDED.email, curp=EXCLUDED.curp, plan_estudio_id=EXCLUDED.plan_estudio_id, usuario_id=EXCLUDED.usuario_id
                    """,
                    matricula, nombre, ap_pat, ap_mat, fecha_nac, email_inst, curp, 
                    plan_estudio_id, usuario_id
                )
                ins += 1
                resultados.append({
                    "no_control": matricula, "nombre": f"{nombre} {ap_pat}",
                    "email": email_inst, "password": pw_texto
                })
        except Exception as e:
            errores.append({"fila": i, "error": str(e)})

    return {"importados": ins, "omitidos": omit, "resultados": resultados, "errores_count": len(errores), "errores": errores}


@router.post("/docentes/preview", response_model=list[DocenteImportPreview])
async def preview_docentes(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    results = []
    
    empleados_existentes = {r["num_empleado"] for r in await conn.fetch("SELECT num_empleado FROM academ.docente")}
    emails_existentes = {r["email"] for r in await conn.fetch("SELECT email FROM academ.usuario")}
    empleados_csv = set()
    emails_csv = set()

    for i, fila in enumerate(filas, start=1):
        num_empleado = fila.get("num_empleado") or fila.get("numero_empleado")
        nombre       = fila.get("nombre")
        ap_pat       = fila.get("apellido_pat")
        ap_mat       = fila.get("apellido_mat")
        fecha        = (fila.get("fecha_nacimiento") or fila.get("fecha") or "").strip()
        email        = fila.get("email")

        # Generar email para el preview si no viene
        email_preview = email or (generar_email_docente(nombre, ap_pat, ap_mat) if (nombre and ap_pat) else None)

        ya_existe = False
        error = None
        if not num_empleado: error = "Num. Empleado es obligatorio"
        elif not nombre: error = "Nombre es obligatorio"
        elif not ap_pat: error = "Apellido Paterno es obligatorio"
        elif not fecha: error = "Fecha de nacimiento es obligatoria para generar el NIP provisional"
        elif not parsear_fecha_nacimiento(fecha): error = "Fecha de nacimiento inválida"
        elif num_empleado in empleados_existentes: 
            error = f"Num. Empleado {num_empleado} ya existe"
            ya_existe = True
        elif num_empleado in empleados_csv: 
            error = f"Num. Empleado {num_empleado} duplicado en CSV"
            ya_existe = True
        elif email_preview and email_preview in emails_existentes: 
            error = f"Email {email_preview} ya está en uso"
            ya_existe = True
        elif email_preview and email_preview in emails_csv: 
            error = f"Email {email_preview} duplicado en CSV"
            ya_existe = True
        
        if num_empleado: empleados_csv.add(num_empleado)
        if email_preview: emails_csv.add(email_preview)

        results.append(DocenteImportPreview(
            fila=i, num_empleado=num_empleado, nombre=nombre or "ERROR",
            apellido_pat=ap_pat or "ERROR", apellido_mat=ap_mat,
            fecha_nacimiento=fecha, email=email_preview,
            error=error, ya_existe=ya_existe
        ))
    return results


@router.post("/docentes/confirmar")
async def confirmar_importar_docentes(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    ins = 0
    resultados = []
    errores = []

    existentes = {r["num_empleado"] for r in await conn.fetch("SELECT num_empleado FROM academ.docente")}
    emails_existentes = {r["email"] for r in await conn.fetch("SELECT email FROM academ.usuario")}

    for i, fila in enumerate(filas, start=1):
        num_empleado = fila.get("num_empleado") or fila.get("numero_empleado")
        nombre       = fila.get("nombre")
        ap_pat       = fila.get("apellido_pat")
        ap_mat       = fila.get("apellido_mat")
        fecha_nac_str = (fila.get("fecha_nacimiento") or fila.get("fecha") or "").strip()

        if not num_empleado or not nombre or not ap_pat:
            errores.append({"fila": i, "error": "Faltan campos obligatorios"})
            continue

        if num_empleado in existentes:
            errores.append({"fila": i, "error": f"Num. Empleado {num_empleado} ya registrado (Omitido)"})
            continue

        try:
            fecha_nac = parsear_fecha_nacimiento(fecha_nac_str)
            if not fecha_nac:
                errores.append({
                    "fila": i,
                    "error": "Fecha de nacimiento obligatoria o inválida; no se generaron credenciales",
                })
                continue

            email_inst = fila.get("email") or generar_email_docente(nombre, ap_pat, ap_mat)
            
            if email_inst in emails_existentes:
                errores.append({"fila": i, "error": f"Email {email_inst} ya registrado (Omitido)"})
                continue

            pw_texto = generar_password_alumno(fecha_nac)
            pw_hashed = hash_password(pw_texto)

            async with conn.transaction():
                usuario_id = await conn.fetchval(
                    "INSERT INTO academ.usuario (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id",
                    email_inst, pw_hashed
                )
                rol_id = await conn.fetchval("SELECT id FROM academ.rol WHERE nombre='DOCENTE'")
                if rol_id:
                    await conn.execute("INSERT INTO academ.usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", usuario_id, rol_id)

                await conn.execute(
                    """
                    INSERT INTO academ.docente (num_empleado, nombre, apellido_pat, apellido_mat, fecha_nacimiento, email, usuario_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                    ON CONFLICT (num_empleado) DO UPDATE SET 
                        nombre=EXCLUDED.nombre, apellido_pat=EXCLUDED.apellido_pat, 
                        apellido_mat=EXCLUDED.apellido_mat, fecha_nacimiento=EXCLUDED.fecha_nacimiento, 
                        email=EXCLUDED.email, usuario_id=EXCLUDED.usuario_id
                    """,
                    num_empleado, nombre, ap_pat, ap_mat, fecha_nac, email_inst, usuario_id
                )
                ins += 1
                resultados.append({
                    "fila": i, "num_empleado": num_empleado, "nombre": f"{nombre} {ap_pat}",
                    "email": email_inst, "password": pw_texto
                })
        except Exception as e:
            errores.append({"fila": i, "error": str(e)})

    return {"importados": ins, "resultados": resultados, "errores": errores}


@router.post("/materias/preview")
async def preview_materias(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    results = []

    for i, fila in enumerate(filas, start=2):
        clave = (fila.get("clave") or fila.get("codigo") or "").strip().upper()
        nombre = (fila.get("nombre") or "").strip()
        cred = fila.get("creditos") or fila.get("cred")
        r = {
            "fila": i, "clave": clave or "—", "nombre": nombre or "—",
            "creditos": cred or "—",
            "error": None, "ya_existe": False
        }

        if not clave or not nombre:
            r["error"] = "Los campos 'clave' y 'nombre' son obligatorios."
            results.append(r); continue

        try:
            ya_existe = await conn.fetchval("SELECT id FROM academ.materia WHERE clave = $1 OR nombre = $2", clave, nombre.strip())
            r["ya_existe"] = bool(ya_existe)
        except Exception as e: r["error"] = str(e)
        results.append(r)
    return results


@router.post("/materias")
async def importar_materias(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    ins = omit = 0
    errores = []

    for i, fila in enumerate(filas, start=2):
        clave = (fila.get("clave") or fila.get("codigo") or "").strip().upper()
        nombre = (fila.get("nombre") or "").strip()
        cred = fila.get("creditos") or fila.get("cred")
        if not clave or not nombre:
            errores.append({"fila": i, "error": "Campos obligatorios faltantes"})
            continue

        try:
            creditos = int(cred) if cred else None
            unidades_raw = fila.get("unidades") or fila.get("temas")

            async with conn.transaction():
                materia_row = await conn.fetchrow(
                    "INSERT INTO academ.materia (nombre, creditos, clave, horas_teoria, horas_practica) VALUES ($1, $2, $3, 0, 0) ON CONFLICT (clave) DO NOTHING RETURNING id",
                    nombre.strip(), creditos, clave
                )
                es_nueva = False
                if materia_row:
                    materia_id = materia_row["id"]; es_nueva = True
                else:
                    materia_id = await conn.fetchval("SELECT id FROM academ.materia WHERE clave = $1 OR nombre = $2", clave, nombre.strip())

                if unidades_raw:
                    lista_unidades = [u.strip() for u in unidades_raw.split("|") if u.strip()]
                    for num, nom in enumerate(lista_unidades, start=1):
                        await conn.execute("INSERT INTO academ.unidad_plantilla (materia_id, numero, nombre) VALUES ($1, $2, $3) ON CONFLICT (materia_id, numero) DO UPDATE SET nombre=EXCLUDED.nombre", materia_id, num, nom)

                if es_nueva: ins += 1
                else: omit += 1
        except Exception as e: errores.append({"fila": i, "error": str(e)})

    return _resultado(ins, omit, errores)


@router.post("/grupos/preview")
async def preview_grupos(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    results = []

    for i, fila in enumerate(filas, start=2):
        c_materia = fila.get("clave_materia") or fila.get("materia") or "—"
        c_docente = fila.get("num_empleado_docente") or fila.get("docente") or fila.get("num_empleado") or "—"
        c_periodo = fila.get("codigo_periodo") or fila.get("periodo") or "—"
        letra     = (fila.get("letra_grupo") or fila.get("letra") or "").strip().upper()

        r = {
            "fila": i, "materia": c_materia, "docente": c_docente, "periodo": c_periodo,
            "letra": letra, "nombre": "—", "error": None, "ya_existe": False
        }

        if c_materia == "—" or c_docente == "—" or c_periodo == "—" or not letra:
            r["error"] = "Faltan campos obligatorios."
            results.append(r); continue

        try:
            cc_opc = fila.get("carrera") or fila.get("carrera_clave")
            mc = await resolver_grupo_desde_clave_materia(conn, str(c_materia).strip(), cc_opc)
            periodo = await conn.fetchrow("SELECT codigo FROM academ.periodo_academico WHERE codigo=$1", c_periodo)
            if not periodo: raise ValueError(f"Periodo '{c_periodo}' no existe.")

            nombre_auto = f"{periodo['codigo']} {mc['clave']}{letra}".strip()
            r["nombre"] = nombre_auto
            ya_existe = await conn.fetchval("SELECT id FROM academ.grupo WHERE nombre=$1", nombre_auto)
            r["ya_existe"] = bool(ya_existe)
        except Exception as e: r["error"] = str(e)
        results.append(r)
    return results


@router.post("/grupos")
async def importar_grupos(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    ins = omit = 0
    errores = []

    for i, fila in enumerate(filas, start=2):
        c_materia = fila.get("clave_materia") or fila.get("materia")
        c_docente = fila.get("num_empleado_docente") or fila.get("docente") or fila.get("num_empleado")
        c_periodo = fila.get("codigo_periodo") or fila.get("periodo")
        letra     = (fila.get("letra_grupo") or fila.get("letra") or "").strip().upper()

        if not (c_materia and c_docente and c_periodo and letra):
            errores.append({"fila": i, "error": "Campos faltantes"})
            continue

        try:
            cc_opc = fila.get("carrera") or fila.get("carrera_clave")
            mc = await resolver_grupo_desde_clave_materia(conn, str(c_materia).strip(), cc_opc)
            docente = await conn.fetchrow("SELECT id FROM academ.docente WHERE num_empleado=$1", c_docente)
            periodo = await conn.fetchrow("SELECT id, codigo FROM academ.periodo_academico WHERE codigo=$1", c_periodo)
            if not docente: raise ValueError("Docente no existe")
            if not periodo: raise ValueError("Periodo no existe")

            nombre = f"{periodo['codigo']} {mc['clave']}{letra}".strip()
            plan_materia_id = await conn.fetchval(
                "SELECT pm.id FROM academ.plan_materia pm JOIN academ.plan_estudio pe ON pe.id=pm.plan_estudio_id WHERE pm.materia_id=$1 AND pe.carrera_id=$2 LIMIT 1",
                mc["materia_id"], mc["carrera_id"]
            )
            if not plan_materia_id: raise ValueError("No se encontró plan de estudios para la carrera.")

            async with conn.transaction():
                ya_e = await conn.fetchval("SELECT id FROM academ.grupo WHERE nombre=$1", nombre)
                if ya_e:
                    omit += 1; continue
                
                from datetime import time as dt_time
                def to_time(s):
                    if not s: return None
                    parts = s.strip().split(':')
                    return dt_time(int(parts[0]), int(parts[1]))
                
                h_ini = to_time(fila.get("hora_inicio"))
                h_fin = to_time(fila.get("hora_fin"))

                row = await conn.fetchrow(
                    "INSERT INTO academ.grupo (nombre, plan_materia_id, docente_id, periodo_id, letra_grupo, horario_dias, hora_inicio, hora_fin, calificacion_maxima) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,100.0) RETURNING id",
                    nombre, plan_materia_id, docente["id"], periodo["id"], letra, fila.get("horario_dias"), h_ini, h_fin
                )
                if row:
                    await conn.execute("INSERT INTO academ.unidad (grupo_id, numero, nombre) SELECT $1, numero, nombre FROM academ.unidad_plantilla WHERE materia_id=$2", row["id"], mc["materia_id"])
                    ins += 1
        except Exception as e: errores.append({"fila": i, "error": str(e)})

    return _resultado(ins, omit, errores)


@router.post("/inscripciones/preview")
async def preview_inscripciones(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    results = []
    for i, fila in enumerate(filas, start=2):
        mat = fila.get("no_control") or fila.get("numero_control") or fila.get("num_control") or fila.get("matricula")
        grp = fila.get("nombre_grupo") or fila.get("grupo") or fila.get("nombre")
        r = {"fila": i, "no_control": mat or "—", "grupo": grp or "—", "error": None, "ya_existe": False}
        if not mat or not grp:
            r["error"] = "Campos faltantes"; results.append(r); continue
        try:
            alu = await conn.fetchrow("SELECT id FROM academ.alumno WHERE no_control=$1", mat)
            if not alu: raise ValueError(f"Alumno {mat} no existe")
            grupo = await conn.fetchrow("SELECT id FROM academ.grupo WHERE nombre=$1", grp)
            if not grupo: raise ValueError(f"Grupo {grp} no existe")
            ya_e = await conn.fetchval("SELECT 1 FROM academ.inscripcion WHERE alumno_id=$1 AND grupo_id=$2", alu["id"], grupo["id"])
            r["ya_existe"] = bool(ya_e)
        except Exception as e: r["error"] = str(e)
        results.append(r)
    return results


@router.post("/inscripciones")
async def importar_inscripciones(
    archivo: UploadFile = File(...),
    conn: Connection = Depends(get_conn),
    _: dict = Depends(require_admin),
):
    filas = _parse_csv(await archivo.read())
    ins = omit = 0
    errores = []
    for i, fila in enumerate(filas, start=2):
        mat = fila.get("no_control") or fila.get("numero_control") or fila.get("num_control") or fila.get("matricula")
        grp = fila.get("nombre_grupo") or fila.get("grupo") or fila.get("nombre")
        if not mat or not grp:
            errores.append({"fila": i, "error": "Campos faltantes"}); continue
        try:
            alu = await conn.fetchrow("SELECT id FROM academ.alumno WHERE no_control=$1", mat)
            if not alu: raise ValueError("Alumno no existe")
            grupo = await conn.fetchrow("SELECT id FROM academ.grupo WHERE nombre=$1", grp)
            if not grupo: raise ValueError("Grupo no existe")
            async with conn.transaction():
                ya_e = await conn.fetchval("SELECT 1 FROM academ.inscripcion WHERE alumno_id=$1 AND grupo_id=$2", alu["id"], grupo["id"])
                if ya_e:
                    omit += 1; continue
                await conn.execute(
                    "INSERT INTO academ.inscripcion (alumno_id, grupo_id) VALUES ($1,$2)",
                    alu["id"],
                    grupo["id"],
                )
                ins += 1
        except Exception as e: errores.append({"fila": i, "error": str(e)})

    return _resultado(ins, omit, errores)
