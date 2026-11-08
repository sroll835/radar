"""RADAR — Configuración central de fuentes de datos abiertos (única fuente de verdad).

Cada fuente declara:
  · dataset            id Socrata en datos.gov.co (verificado contra /api/views/<id>.json)
  · columns            columnas reales que se usan; buildWhere/$select solo pueden usar estas
  · entity_fields      campos de NOMBRE DE ENTIDAD → admiten alias (PRESIDENCIA → DAPRE)
  · name_fields        campos de nombre de persona/empresa → sin alias
  · name_concats       combinaciones de columnas que se concatenan para buscar nombres completos
  · id_fields          campos de identificación (coincidencia exacta); vacío = la fuente no admite búsqueda por ID
  · normalize()        convierte cada fila real a los nombres internos que usan riesgo.py, graph_service.py,
                       report_agent.py y los frontends (así esos consumidores no cambian)

Reglas de búsqueda (build_where):
  · solo nombre  → coincidencia parcial, sin mayúsculas ni tildes, solo en campos de nombre
  · solo ID      → coincidencia exacta
  · nombre + ID  → AND
  · sin resultados → lista vacía (nunca datos de demostración)
"""
import os, re, time, unicodedata
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable, Dict, List, Optional, Tuple

import requests

SOCRATA_DOMAIN = os.environ.get('SOCRATA_DOMAIN', 'https://www.datos.gov.co').rstrip('/')
SOCRATA_APP_TOKEN = os.environ.get('SOCRATA_APP_TOKEN', '')      # opcional: sube el límite de peticiones
TIMEOUT = 20                                                      # segundos por intento
REINTENTOS = 2                                                    # además del primer intento
ESPERA_BASE = 1.0                                                 # 1 s, 2 s (espera creciente)

# ── Alias de entidades ────────────────────────────────────────────────────────
# Clave: palabra que escribe el usuario (sin tildes, mayúsculas). Valor: nombres/siglas con que aparece la
# entidad en los datasets. SOLO se aplica a entity_fields: «DAPRE» coincide por accidente con empresas del
# RUES (p. ej. «…SALUDAPRESALUD…»), por eso nunca se usa en RUES ni en campos de persona.
ALIAS_ENTIDADES: Dict[str, List[str]] = {
    'PRESIDENCIA': ['DAPRE'],      # SECOP II registra al Departamento Administrativo de la Presidencia como «DAPRE»
}


def _sin_tildes(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def _limpiar(texto: str) -> str:
    """Quita comodines SoQL (% _) y caracteres de control; conserva letras, dígitos, espacios y . - & '"""
    t = re.sub(r"[^\w\s.\-&'ÁÉÍÓÚÜÑáéíóúüñ]", ' ', texto or '').replace('_', ' ')
    return re.sub(r'\s+', ' ', t).strip()


def soql_str(v: str) -> str:
    """Literal SoQL seguro: escapa comillas simples duplicándolas."""
    return "'" + str(v).replace("'", "''") + "'"


def patron_nombre(texto: str) -> Optional[str]:
    """«Alcaldía Bogotá» → '%_LC_LD__%B_G_T_%'. Palabras unidas con % (mismo orden, texto intermedio libre);
    en palabras de 5+ letras las vocales y la Ñ pasan a '_' para ignorar tildes. Las siglas cortas quedan literales."""
    palabras = []
    for w in _limpiar(texto).upper().split(' '):
        if not w: continue
        if len(w) >= 5:
            w = re.sub('[AEIOUÁÉÍÓÚÜÑ]', '_', w)
        palabras.append(w)
    return ('%' + '%'.join(palabras) + '%') if palabras else None


def limpiar_id(ced: str) -> str:
    return re.sub(r'[^0-9A-Za-z]', '', ced or '').upper()


def _num(v) -> float:
    try: return float(str(v).replace(',', '').strip() or 0)
    except ValueError: return 0.0


def _fecha_dmy(v: str) -> str:
    """'22/04/2005' → '2005-04-22'"""
    m = re.match(r'\s*(\d{1,2})/(\d{1,2})/(\d{4})', v or '')
    return f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}' if m else (v or '')


def _fecha_ymd(v: str) -> str:
    """'19740819' → '1974-08-19'"""
    v = (v or '').strip()
    return f'{v[:4]}-{v[4:6]}-{v[6:8]}' if re.fullmatch(r'\d{8}', v) and v != '99991231' else ''


def nit_base(documento: str, tipo: str = '') -> str:
    """NIT sin dígito de verificación. SECOP guarda NIT+DV (10 dígitos) y RUES el NIT de 9 dígitos."""
    d = re.sub(r'\D', '', documento or '')
    if 'NIT' in (tipo or '').upper() and len(d) == 10:
        return d[:9]
    return d


_NIVELES = {'DIRECTIVO': 'Directivo', 'ASESOR': 'Asesor', 'PROFESIONAL': 'Profesional',
            'TECNICO': 'Técnico', 'ASISTENCIAL': 'Asistencial'}


def _nivel(v: str) -> str:
    k = _sin_tildes((v or '').strip().upper())
    return _NIVELES.get(k, (v or '').strip().title())


@dataclass
class Fuente:
    nombre: str                       # clave interna (la que usan resultados, riesgo y frontends)
    dataset: str
    titulo: str
    columns: List[str]
    entity_fields: List[str]
    name_fields: List[str] = field(default_factory=list)
    name_concats: List[Tuple[str, ...]] = field(default_factory=list)
    id_fields: List[str] = field(default_factory=list)
    id_admite_dv: bool = False        # SECOP: un NIT de 9 dígitos también coincide con NIT+DV
    order: str = ''
    limit: int = 30
    sort_py: Optional[Callable[[dict], float]] = None   # orden en Python cuando la columna es texto
    normalize: Callable[[dict], dict] = lambda r: r
    sin_id_msg: str = 'sin identificación en este dataset'

    @property
    def url(self): return f'{SOCRATA_DOMAIN}/resource/{self.dataset}.json'


# ── Normalizadores (fila real → nombres internos; se conservan también las columnas originales) ──────

def _norm_secop(r):
    return {**r,
            'nombre_del_proveedor': r.get('proveedor_adjudicado', ''),
            'nit_del_proveedor_adjudicado': nit_base(r.get('documento_proveedor', ''), r.get('tipodocproveedor', '')),
            'urlproceso': (r.get('urlproceso') or {}).get('url', '') if isinstance(r.get('urlproceso'), dict) else r.get('urlproceso', '')}


def _norm_siri(r):
    nombre = ' '.join(x.strip() for x in (r.get('primer_nombre'), r.get('segundo_nombre'), r.get('primer_apellido'), r.get('segundo_apellido')) if x and x.strip())
    dur = ', '.join(f'{r[k].strip()} {u}' for k, u in (('duracion_anos', 'años'), ('duracion_mes', 'meses'), ('duracion_dias', 'días')) if (r.get(k) or '').strip())
    return {**r,
            'sancionado': nombre, 'nombre_sancionado': nombre,
            'cedula': (r.get('numero_identificacion') or '').strip(),
            'numero_identificacion': (r.get('numero_identificacion') or '').strip(),
            'tipo_sancion': r.get('sanciones', ''),
            'entidad': r.get('entidad_sancionado', ''), 'entidad_sancionadora': r.get('autoridad', ''),
            'fecha_ejecutoria': _fecha_dmy(r.get('fecha_efectos_juridicos', '')),
            'termino_sancion': dur, 'departamento': r.get('lugar_hechos_departamento', '')}


def _norm_contraloria(r):
    estado = (r.get('estado_del_proceso_al_final') or '').strip().upper()
    # El dataset no usa la palabra «ACTIVO»: «EN TRÁMITE…» es un proceso activo (lo marca el motor de riesgo)
    if estado and 'ACTIVO' not in estado and _sin_tildes(estado).startswith('EN TRAMITE'):
        estado = 'ACTIVO · ' + estado
    return {**r,
            'nombre_implicado': f"{r.get('tipo_de_proceso', 'Proceso')} {r.get('no_expendiente', '')}".strip(),
            'entidad_afectada': r.get('entidad_afectada', ''),
            'descripcion': r.get('descripci_n_del_hecho', ''),
            'cuantia_fallo': str(_num(r.get('valor_presunto_detrimento'))),
            'estado_proceso': estado, 'tipo_proceso': r.get('tipo_de_proceso', ''),
            'vigencia': r.get('a_o_de_apertura', '')}


def _norm_siif(r):
    n3, n4 = (r.get('nombreniveltres') or '').strip(), (r.get('nombrecuartonivel') or '').strip()
    rubro = n3 if (not n4 or n4 == n3) else f'{n3} · {n4}'
    return {**r,
            'nombre_entidad': r.get('nombreentidad', ''), 'sector': r.get('nombresector', ''),
            'rubro_presupuestal': rubro or (r.get('nombrenieldos') or ''),
            'tipo_gasto': (r.get('nombreniveluno') or '').strip().title().replace('Inversion', 'Inversión'),
            'apropiacion_definitiva': r.get('apropiacionvigente', '0'),
            'compromisos': r.get('compromisos', '0'), 'obligaciones': r.get('obligaciones', '0'), 'pagos': r.get('pagos', '0')}


def _norm_sigep(r):
    # El dataset no publica nombres ni cédulas ni grado: no se inventan (los consumidores lo detectan por ausencia de 'grado')
    return {**r,
            'nombre_entidad': r.get('nombreentidad', ''),
            'cargo_nivel': _nivel(r.get('niveljerarquicoempleo', '')),
            'nombre_cargo': r.get('denominacionempleoactual', ''),
            'nombre_completo': 'Servidor(a) — ' + (r.get('denominacionempleoactual') or 'cargo no informado'),
            'tipo_vinculacion': (r.get('tipodenombramiento') or '').title(),
            'asignacion_basica': str(_num(r.get('asignacionbasicasalarial'))),
            'dependencia': r.get('dependenciaempleoactual', ''),
            'fecha_posesion': (r.get('fecha_de_vinculaci_n') or '')[:10]}


def _norm_rues(r):
    return {**r,
            'nit': (r.get('nit') or r.get('numero_identificacion') or '').strip(),
            'razon_social': r.get('razon_social', ''),
            'estado': r.get('estado_matricula', ''), 'estado_matricula': r.get('estado_matricula', ''),
            'ciudad': r.get('camara_comercio', ''),
            'fecha_matricula': _fecha_ymd(r.get('fecha_matricula', '')),
            'actividad_economica': ('CIIU ' + r['cod_ciiu_act_econ_pri']) if r.get('cod_ciiu_act_econ_pri') else ''}


FUENTES: List[Fuente] = [
    Fuente('SECOP II', 'jbjy-vk9h', 'SECOP II - Contratos Electrónicos',
           columns=['nombre_entidad', 'nit_entidad', 'departamento', 'ciudad', 'proveedor_adjudicado', 'documento_proveedor',
                    'tipodocproveedor', 'valor_del_contrato', 'modalidad_de_contratacion', 'estado_contrato', 'fecha_de_firma',
                    'objeto_del_contrato', 'tipo_de_contrato', 'id_contrato', 'urlproceso'],
           entity_fields=['nombre_entidad'], name_fields=['proveedor_adjudicado'],
           id_fields=['documento_proveedor'], id_admite_dv=True,
           order='valor_del_contrato DESC', limit=35, normalize=_norm_secop),
    Fuente('Procuraduría SIRI', 'iaeu-rcn6', 'Antecedentes de SIRI',
           columns=['numero_siri', 'tipo_inhabilidad', 'calidad_persona', 'numero_identificacion', 'primer_apellido', 'segundo_apellido',
                    'primer_nombre', 'segundo_nombre', 'cargo', 'lugar_hechos_departamento', 'lugar_hechos_municipio', 'sanciones',
                    'duracion_anos', 'duracion_mes', 'duracion_dias', 'providencia', 'autoridad', 'fecha_efectos_juridicos',
                    'numero_proceso', 'entidad_sancionado', 'entidad_departamento', 'entidad_municipio'],
           entity_fields=['entidad_sancionado'],
           # Las combinaciones de 3 y 4 columnas permiten encontrar nombres completos («Juan Carlos Rodríguez Rivera»);
           # con solo pares, un nombre de 3-4 palabras no coincidía con nada (falso negativo).
           name_concats=[('primer_nombre', 'primer_apellido'), ('primer_apellido', 'segundo_apellido'), ('primer_nombre', 'segundo_nombre'),
                         ('primer_nombre', 'primer_apellido', 'segundo_apellido'), ('primer_nombre', 'segundo_nombre', 'primer_apellido'),
                         ('primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido')],
           # Se piden más filas porque después se descartan las sanciones que ya no son reportables (ver filtrar_siri)
           id_fields=['numero_identificacion'], limit=60, normalize=_norm_siri),
    Fuente('Contraloría', 'n2rx-k8hk', 'Procesos de Responsabilidad Fiscal',
           columns=['no_expendiente', 'tipo_de_proceso', 'descripci_n_del_hecho', 'entidad_afectada', 'a_o_de_apertura',
                    'valor_presunto_detrimento', 'estado_del_proceso_al_final', 'origen'],
           entity_fields=['entidad_afectada'], limit=40,
           sort_py=lambda r: -_num(r.get('valor_presunto_detrimento')), normalize=_norm_contraloria,
           sin_id_msg='sin identificación de implicados en este dataset'),
    Fuente('SIIF Nación', 'bpij-5vy9', 'Ejecución PGN detallada por rubro',
           columns=['nombresector', 'nombreentidad', 'nombreniveluno', 'nombrenieldos', 'nombreniveltres', 'nombrecuartonivel',
                    'apropiacionvigente', 'compromisos', 'obligaciones', 'pagos', 'recursospresupuestales'],
           entity_fields=['nombreentidad', 'nombresector'], order='apropiacionvigente DESC', limit=50, normalize=_norm_siif,
           sin_id_msg='sin identificación (datos presupuestales por entidad)'),
    Fuente('SIGEP / DAFP', '2jzx-383z', 'Conjunto servidores públicos',
           columns=['nombreentidad', 'orden', 'naturalezajuridica', 'tipodenombramiento', 'niveljerarquicoempleo',
                    'denominacionempleoactual', 'dependenciaempleoactual', 'asignacionbasicasalarial', 'fecha_de_vinculaci_n', 'sexo'],
           entity_fields=['nombreentidad'], limit=30, normalize=_norm_sigep),
    Fuente('RUES / Confecámaras', 'c82u-588k', 'Personas Naturales, Jurídicas y ESAL',
           columns=['camara_comercio', 'matricula', 'razon_social', 'sigla', 'clase_identificacion', 'numero_identificacion', 'nit',
                    'digito_verificacion', 'cod_ciiu_act_econ_pri', 'fecha_matricula', 'ultimo_ano_renovado', 'tipo_sociedad',
                    'organizacion_juridica', 'estado_matricula', 'representante_legal', 'num_identificacion_representante_legal'],
           entity_fields=[], name_fields=['razon_social', 'sigla'],
           id_fields=['nit', 'numero_identificacion'], limit=15, normalize=_norm_rues),
]
POR_NOMBRE = {f.nombre: f for f in FUENTES}


# ── buildWhere ────────────────────────────────────────────────────────────────

class CampoInvalido(ValueError):
    pass


def _validar(f: Fuente, campos):
    malos = [c for c in campos if c not in f.columns]
    if malos:
        raise CampoInvalido(f'{f.nombre}: campo(s) no declarados en la configuración: {", ".join(malos)}')


def alias_para(q: str) -> List[str]:
    palabras = set(_sin_tildes(_limpiar(q)).upper().split())
    return [a for clave, alias in ALIAS_ENTIDADES.items() if clave in palabras for a in alias]


def build_where(f: Fuente, q: str = '', ced: str = '') -> Tuple[Optional[str], Optional[str]]:
    """Devuelve (where, motivo_no_aplica). where=None + motivo → la fuente no aplica a esta búsqueda."""
    q, idv = (q or '').strip(), limpiar_id(ced)
    if idv and not f.id_fields:
        return None, f.sin_id_msg
    partes = []
    if q:
        pat = patron_nombre(q)
        if not pat:
            return None, 'término de búsqueda vacío tras limpiarlo'
        campos = f.entity_fields + f.name_fields + [c for t in f.name_concats for c in t]
        _validar(f, campos)
        conds = [f'upper({c}) like {soql_str(pat)}' for c in f.entity_fields + f.name_fields]
        conds += ["upper(" + " || ' ' || ".join(t) + f') like {soql_str(pat)}' for t in f.name_concats]
        for a in alias_para(q):                                  # solo campos de entidad
            conds += [f'upper({c}) like {soql_str("%" + a + "%")}' for c in f.entity_fields]
        if not conds:
            return None, 'esta fuente no tiene campos de nombre'
        partes.append('(' + ' OR '.join(conds) + ')')
    if idv:
        _validar(f, f.id_fields)
        conds = [f'trim({c}) = {soql_str(idv)}' for c in f.id_fields]
        if f.id_admite_dv and len(idv) == 9 and idv.isdigit():
            conds += [f'trim({c}) like {soql_str(idv + "_")}' for c in f.id_fields]   # NIT + dígito de verificación
        partes.append('(' + ' OR '.join(conds) + ')')
    if not partes:
        return None, 'sin término de búsqueda'
    return ' AND '.join(partes), None


# ── Calidad del dato: homónimos y sanciones no reportables ────────────────────
# Ley 1581/2012 art. 4 lit. d (veracidad): no se puede atribuir a una persona el registro de otra con nombre parecido,
# ni seguir mostrando como antecedente una sanción que ya perdió vigencia.

# Cómo se identifica a la persona/empresa de cada fila en las fuentes que alimentan alertas y score
IDENTIDAD: Dict[str, Callable[[dict], str]] = {
    'SECOP II': lambda r: r.get('nit_del_proveedor_adjudicado') or _sin_tildes(r.get('nombre_del_proveedor', '')).upper().strip(),
    'Procuraduría SIRI': lambda r: r.get('cedula') or r.get('sancionado', ''),
}
ANOS_REPORTE_SIRI = 5   # criterio del certificado de antecedentes: sanciones de los últimos 5 años o aún vigentes


def _regex_like(pat: str):
    return re.compile(''.join('.*' if ch == '%' else '.' if ch == '_' else re.escape(ch) for ch in pat), re.S)


def coincidencia(f: Fuente, q: str, ced: str, fila: dict) -> str:
    """'id' (por cédula/NIT), 'entidad' (la fila es de la entidad buscada) o 'nombre' (coincidió el nombre de una persona o empresa)."""
    if limpiar_id(ced):
        return 'id'
    pat = patron_nombre(q)
    if pat:
        rx, alias = _regex_like(pat), alias_para(q)
        for c in f.entity_fields:
            v = str(fila.get(c) or '').upper()
            if rx.fullmatch(v) or any(a in v for a in alias):
                return 'entidad'
    return 'nombre'


def _parse_fecha(v: str) -> Optional[date]:
    try: return date.fromisoformat((v or '')[:10])
    except ValueError: return None


def _sumar(d: date, anos=0, meses=0, dias=0) -> date:
    m = d.month - 1 + meses
    y, m = d.year + anos + m // 12, m % 12 + 1
    dia = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return date(y, m, dia) + timedelta(days=dias)


def _fin_sancion(fila: dict) -> Optional[date]:
    ini = _parse_fecha(fila.get('fecha_ejecutoria', ''))
    n = lambda k: int(_num(fila.get(k)))
    if not ini or not (n('duracion_anos') or n('duracion_mes') or n('duracion_dias')):
        return None
    return _sumar(ini, n('duracion_anos'), n('duracion_mes'), n('duracion_dias'))


def filtrar_siri(datos: List[dict], hoy: Optional[date] = None) -> Tuple[List[dict], int]:
    """Conserva solo sanciones reportables: vigentes o con efectos en los últimos ANOS_REPORTE_SIRI años.
    SIRI publica una fila por sanción de la misma decisión (p. ej. DESTITUCION + INHABILIDAD 20 años): se evalúan juntas."""
    hoy = hoy or date.today()
    limite = _sumar(hoy, -ANOS_REPORTE_SIRI)
    grupos: Dict[tuple, List[dict]] = {}
    for r in datos:
        grupos.setdefault((r.get('cedula') or r.get('sancionado'), r.get('fecha_ejecutoria')), []).append(r)
    out, retiradas = [], 0
    for filas in grupos.values():
        ini = _parse_fecha(filas[0].get('fecha_ejecutoria', ''))
        fines = [x for x in (_fin_sancion(r) for r in filas) if x]
        permanente = any('PERMANENTE' in (r.get('tipo_sancion') or '').upper() for r in filas)
        vigente = permanente or any(x >= hoy for x in fines)
        if ini is None or vigente or ini >= limite:
            for r in filas:
                r['_vigente'] = vigente
            out += filas
        else:
            retiradas += len(filas)
    return out, retiradas


def depurar(f: Fuente, q: str, ced: str, datos: List[dict], hoy: Optional[date] = None) -> dict:
    """Marca cómo coincidió cada fila, retira sanciones no reportables y separa homónimos.
    → {'datos': atribuibles, 'homonimos': [...], 'personas_homonimas': n, 'retiradas_antiguas': k}"""
    for r in datos:
        r['_coincidencia'] = coincidencia(f, q, ced, r)
    retiradas = 0
    if f.nombre == 'Procuraduría SIRI':
        datos, retiradas = filtrar_siri(datos, hoy)
    homonimos, personas = [], 0
    ident = IDENTIDAD.get(f.nombre)
    if ident and not limpiar_id(ced):
        por_nombre = [r for r in datos if r['_coincidencia'] == 'nombre']
        ids = {ident(r) for r in por_nombre}
        if len(ids) > 1:
            # Varias personas/empresas distintas con nombre parecido: ninguna se atribuye a la búsqueda
            homonimos, personas = por_nombre, len(ids)
            datos = [r for r in datos if r['_coincidencia'] != 'nombre']
    return {'datos': datos, 'homonimos': homonimos, 'personas_homonimas': personas, 'retiradas_antiguas': retiradas}


# ── Consulta con estado, timeout y reintentos ─────────────────────────────────

_meta_cache: Dict[str, Tuple[float, Optional[set]]] = {}


def columnas_reales(f: Fuente, http=requests) -> Optional[set]:
    """Columnas del dataset según /api/views (cacheado 1 h). None si no se pudo consultar."""
    t, cols = _meta_cache.get(f.dataset, (0, None))
    if cols is not None and time.time() - t < 3600:
        return cols
    try:
        r = http.get(f'{SOCRATA_DOMAIN}/api/views/{f.dataset}.json', timeout=10, headers=_headers())
        if r.status_code == 200:
            cols = {c['fieldName'] for c in r.json().get('columns', [])}
            _meta_cache[f.dataset] = (time.time(), cols)
            return cols
    except Exception:
        pass
    return None


def _headers():
    h = {'Accept': 'application/json'}
    if SOCRATA_APP_TOKEN: h['X-App-Token'] = SOCRATA_APP_TOKEN
    return h


def _mensaje_http(r) -> str:
    try:
        b = r.json()
        msg = b.get('message') or b.get('code') or ''
    except Exception:
        msg = (r.text or '')[:160]
    base = {400: 'consulta rechazada (400)', 404: 'dataset no encontrado (404)', 429: 'límite de peticiones (429)'}.get(
        r.status_code, f'HTTP {r.status_code}')
    return f'{base}: {msg}'[:300] if msg else base


def consultar(f: Fuente, q: str = '', ced: str = '', http=requests, sleep=time.sleep) -> dict:
    """→ {'estado': ok|vacia|error|no_aplica, 'registros': n, 'mensaje': str, 'dataset': id, 'datos': [...]}"""
    base = {'dataset': f.dataset, 'registros': 0, 'datos': []}
    try:
        where, motivo = build_where(f, q, ced)
    except CampoInvalido as e:
        return {**base, 'estado': 'error', 'mensaje': str(e)}
    if motivo:
        return {**base, 'estado': 'no_aplica', 'mensaje': motivo}

    reales = columnas_reales(f, http)
    if reales is not None:
        faltan = [c for c in f.columns if c not in reales]
        if faltan:
            return {**base, 'estado': 'error', 'mensaje': f'el dataset cambió: no existen {", ".join(faltan[:6])}'}

    params = {'$select': ','.join(f.columns), '$where': where, '$limit': str(f.limit)}
    if f.order: params['$order'] = f.order
    ultimo = ''
    for intento in range(REINTENTOS + 1):
        try:
            r = http.get(f.url, params=params, timeout=TIMEOUT, headers=_headers())
            if r.status_code == 200:
                filas = r.json()
                if not isinstance(filas, list):
                    return {**base, 'estado': 'error', 'mensaje': 'respuesta inesperada del servidor'}
                if f.sort_py: filas.sort(key=f.sort_py)
                dep = depurar(f, q, ced, [f.normalize(x) for x in filas])
                datos = dep['datos']
                notas = []
                if dep['homonimos']:
                    notas.append(f'{len(dep["homonimos"])} registros de {dep["personas_homonimas"]} personas/empresas distintas con nombre '
                                 'similar no se atribuyen a la búsqueda (agregue la cédula o NIT)')
                if dep['retiradas_antiguas']:
                    notas.append(f'{dep["retiradas_antiguas"]} sanciones antiguas no vigentes omitidas')
                msg = (f'{len(datos)} registros' if datos else 'sin registros atribuibles') + (' · ' + ' · '.join(notas) if notas else '')
                return {**base, 'estado': 'ok' if datos else 'vacia', 'registros': len(datos), 'datos': datos,
                        'homonimos': dep['homonimos'], 'personas_homonimas': dep['personas_homonimas'],
                        'retiradas_antiguas': dep['retiradas_antiguas'],
                        'mensaje': msg if (datos or notas) else 'sin registros'}
            ultimo = _mensaje_http(r)
            if r.status_code in (400, 401, 403, 404):          # errores deterministas: no se reintenta
                break
        except requests.Timeout:
            ultimo = f'tiempo de espera agotado ({TIMEOUT} s)'
        except requests.ConnectionError:
            ultimo = 'error de conexión'
        except ValueError:
            ultimo = 'respuesta no es JSON'
        if intento < REINTENTOS:
            sleep(ESPERA_BASE * (2 ** intento))
    return {**base, 'estado': 'error', 'mensaje': ultimo or 'error desconocido'}
