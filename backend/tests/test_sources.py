"""buildWhere, normalización y consulta con estados (sin red: HTTP simulado)."""
import pytest, requests
from conftest import FakeHTTP, FakeResp
from app import sources as S
from app.sources import POR_NOMBRE, build_where, consultar, patron_nombre, CampoInvalido, Fuente

SECOP, SIRI, CONT, SIIF, SIGEP, RUES = (POR_NOMBRE[k] for k in
    ('SECOP II', 'Procuraduría SIRI', 'Contraloría', 'SIIF Nación', 'SIGEP / DAFP', 'RUES / Confecámaras'))


# ── buildWhere ──────────────────────────────────────────────────────────────

def test_solo_nombre_parcial_en_campos_de_nombre():
    w, motivo = build_where(SECOP, 'INVIAS', '')
    assert motivo is None
    assert "upper(nombre_entidad) like '%_NV__S%'" in w           # 5+ letras: vocales → comodín
    assert "upper(proveedor_adjudicado) like '%_NV__S%'" in w
    w_corta, _ = build_where(SECOP, 'ICBF', '')
    assert "upper(nombre_entidad) like '%ICBF%'" in w_corta        # siglas cortas literales
    assert 'objeto_del_contrato' not in w and 'documento_proveedor' not in w


def test_tildes_comodin_y_palabras():
    assert patron_nombre('Alcaldía Bogotá') == patron_nombre('ALCALDIA BOGOTA') == '%_LC_LD__%B_G_T_%'
    assert patron_nombre('Min Salud') == '%MIN%S_L_D%'          # siglas cortas literales


def test_alias_dapre_solo_en_campos_de_entidad():
    w, _ = build_where(SECOP, 'Presidencia', '')
    assert "upper(nombre_entidad) like '%DAPRE%'" in w
    assert "upper(proveedor_adjudicado) like '%DAPRE%'" not in w      # no en nombres de persona/empresa
    w_rues, _ = build_where(RUES, 'Presidencia', '')
    assert 'DAPRE' not in w_rues                                     # nunca en RUES


def test_solo_id_exacto():
    w, _ = build_where(RUES, '', '900.170.781')
    assert w == "(trim(nit) = '900170781' OR trim(numero_identificacion) = '900170781')"
    w2, _ = build_where(SECOP, '', '800058671')                       # NIT de 9 dígitos también con su DV
    assert "trim(documento_proveedor) = '800058671'" in w2 and "like '800058671_'" in w2


def test_nombre_mas_id_es_and():
    w, _ = build_where(SIRI, 'Gabriel Botina', '7534386')
    assert ") AND (" in w
    assert "upper(primer_nombre || ' ' || primer_apellido) like '%G_BR__L%B_T_N_%'" in w
    assert "trim(numero_identificacion) = '7534386'" in w


def test_id_en_fuente_sin_identificacion_no_aplica():
    for f in (SIGEP, CONT, SIIF):
        w, motivo = build_where(f, '', '123456')
        assert w is None and 'sin identificación' in motivo
    w, motivo = build_where(SIGEP, 'Presidencia', '123456')          # nombre + ID tampoco: no se relaja el AND
    assert w is None and motivo


def test_comillas_simples_escapadas():
    w, _ = build_where(RUES, "D'Angelo", '')
    assert "'%D''_NG_L_%'" in w
    assert w.count("'") % 2 == 0


def test_campo_inexistente_rechazado():
    rota = Fuente('Rota', 'xxxx-xxxx', 't', columns=['a'], entity_fields=['no_existe'])
    with pytest.raises(CampoInvalido):
        build_where(rota, 'algo', '')
    r = consultar(rota, 'algo', '', http=FakeHTTP({}))
    assert r['estado'] == 'error' and 'no_existe' in r['mensaje']


def test_sin_terminos():
    assert build_where(SECOP, '', '') == (None, 'sin término de búsqueda')
    assert build_where(SECOP, '%%__', '')[0] is None


# ── Normalización con filas de muestra reales ────────────────────────────────

def test_norm_secop():
    r = S._norm_secop({'nombre_entidad': 'DAPRE', 'proveedor_adjudicado': 'BORVILL SAS', 'documento_proveedor': '8000586714',
                       'tipodocproveedor': 'NIT', 'valor_del_contrato': '1000', 'modalidad_de_contratacion': 'Contratación directa',
                       'urlproceso': {'url': 'https://x'}})
    assert r['nombre_del_proveedor'] == 'BORVILL SAS'
    assert r['nit_del_proveedor_adjudicado'] == '800058671'          # sin dígito de verificación (como RUES)
    assert r['urlproceso'] == 'https://x' and 'numero_de_oferentes' not in r


def test_norm_siri():
    r = S._norm_siri({'numero_identificacion': '7534386        ', 'primer_apellido': 'BOTINA', 'segundo_apellido': 'OLIVEROS',
                      'primer_nombre': 'GABRIEL', 'segundo_nombre': 'ANTONIO', 'cargo': 'MIEMBRO DE LA FUERZA PUBLICA',
                      'sanciones': 'MULTA', 'fecha_efectos_juridicos': '22/04/2005', 'entidad_sancionado': 'FUERZAS PUBLICAS',
                      'lugar_hechos_departamento': 'VALLE DEL CAUCA', 'autoridad': 'COMANDANTE', 'duracion_mes': '3'})
    assert r['sancionado'] == 'GABRIEL ANTONIO BOTINA OLIVEROS'
    assert r['cedula'] == '7534386' and r['tipo_sancion'] == 'MULTA'
    assert r['fecha_ejecutoria'] == '2005-04-22' and r['termino_sancion'] == '3 meses'


def test_norm_contraloria():
    r = S._norm_contraloria({'no_expendiente': 'PRF-17-26', 'tipo_de_proceso': 'PRFORDINARIOS', 'entidad_afectada': 'MUNICIPIO DE TIMBIQUI',
                             'valor_presunto_detrimento': '36390490', 'descripci_n_del_hecho': 'Irregularidades',
                             'estado_del_proceso_al_final': 'En trámite con auto de apertura y antes de imputación'})
    assert r['cuantia_fallo'] == '36390490.0'
    assert r['estado_proceso'].startswith('ACTIVO · EN TRÁMITE')
    assert r['nombre_implicado'] == 'PRFORDINARIOS PRF-17-26'


def test_norm_siif():
    r = S._norm_siif({'nombreentidad': 'PRESIDENCIA DE LA REPUBLICA - GESTION GENERAL', 'nombresector': 'PRESIDENCIA DE LA REPUBLICA',
                      'nombreniveluno': 'FUNCIONAMIENTO', 'nombreniveltres': 'SENTENCIAS Y CONCILIACIONES',
                      'nombrecuartonivel': 'SENTENCIAS Y CONCILIACIONES', 'apropiacionvigente': '1500', 'compromisos': '900'})
    assert r['nombre_entidad'].startswith('PRESIDENCIA') and r['rubro_presupuestal'] == 'SENTENCIAS Y CONCILIACIONES'
    assert r['apropiacion_definitiva'] == '1500' and r['tipo_gasto'] == 'Funcionamiento'


def test_norm_sigep_sin_inventar_identidad():
    r = S._norm_sigep({'nombreentidad': 'DEPARTAMENTO ADMINISTRATIVO DE LA PRESIDENCIA DE LA REPUBLICA', 'niveljerarquicoempleo': 'TÉCNICO',
                       'denominacionempleoactual': 'TECNICO ADMINISTRATIVO', 'asignacionbasicasalarial': '2900000',
                       'tipodenombramiento': 'CARRERA ADMINISTRATIVA', 'fecha_de_vinculaci_n': '2019-01-02T00:00:00.000'})
    assert r['cargo_nivel'] == 'Técnico' and r['asignacion_basica'] == '2900000.0'
    assert 'grado' not in r and 'cedula' not in r and 'primer_nombre' not in r


def test_norm_rues():
    r = S._norm_rues({'razon_social': 'ESCANHER ABOGADOS SAS', 'nit': '900170781', 'camara_comercio': 'BOGOTA',
                      'fecha_matricula': '20070315', 'estado_matricula': 'ACTIVA', 'cod_ciiu_act_econ_pri': '6910'})
    assert r['nit'] == '900170781' and r['fecha_matricula'] == '2007-03-15'
    assert r['estado'] == 'ACTIVA' and r['actividad_economica'] == 'CIIU 6910'


# ── consultar(): estados, reintentos, metadatos ──────────────────────────────

def test_consultar_ok_vacia_y_select():
    http = FakeHTTP({'jbjy-vk9h': FakeResp(200, [{'nombre_entidad': 'DAPRE', 'proveedor_adjudicado': 'X', 'documento_proveedor': '1'}])})
    r = consultar(SECOP, 'Presidencia', '', http=http, sleep=lambda s: None)
    assert r['estado'] == 'ok' and r['registros'] == 1 and r['datos'][0]['nombre_del_proveedor'] == 'X'
    params = http.llamadas[-1][1]
    assert 'numero_de_oferentes' not in params['$select'] and 'numero_de_oferentes' not in params['$where']
    r2 = consultar(SECOP, 'zzzz qwerty', '', http=FakeHTTP({}), sleep=lambda s: None)
    assert r2['estado'] == 'vacia' and r2['datos'] == []


def test_consultar_404_es_error_sin_reintentos():
    http = FakeHTTP({'qkam': FakeResp(404, {'code': 'dataset.missing', 'message': 'Not found'})})
    f = Fuente('Vieja', 'qkam-fi98', 't', columns=['entidad'], entity_fields=['entidad'])
    r = consultar(f, 'x', '', http=http, sleep=lambda s: None)
    assert r['estado'] == 'error' and '404' in r['mensaje'] and len(http.llamadas) == 2   # metadatos + 1 intento


def test_consultar_timeout_reintenta_con_espera_creciente():
    esperas = []
    http = FakeHTTP({'jbjy-vk9h': [requests.Timeout(), requests.Timeout(), FakeResp(200, [{'nombre_entidad': 'A'}])]})
    r = consultar(SECOP, 'a b c d e', '', http=http, sleep=esperas.append)
    assert r['estado'] == 'ok' and esperas == [1.0, 2.0]
    http2 = FakeHTTP({'jbjy-vk9h': [requests.ConnectionError()] * 3})
    r2 = consultar(SECOP, 'abc', '', http=http2, sleep=lambda s: None)
    assert r2['estado'] == 'error' and 'conexión' in r2['mensaje']


def test_consultar_detecta_cambio_de_esquema():
    S._meta_cache.clear()
    http = FakeHTTP({}, meta={'jbjy-vk9h': ['nombre_entidad']})            # faltan columnas declaradas
    r = consultar(SECOP, 'abc', '', http=http, sleep=lambda s: None)
    assert r['estado'] == 'error' and 'el dataset cambió' in r['mensaje']
    S._meta_cache.clear()
