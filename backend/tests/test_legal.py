"""Correcciones de la revisión legal: homónimos, vigencia de sanciones, alertas no acusatorias, simulación e IA externa."""
from datetime import date
import pytest
from conftest import FakeHTTP, FakeResp
from app.sources import POR_NOMBRE, build_where, consultar, depurar, filtrar_siri, coincidencia
from app.services.riesgo import detect_alerts

SECOP, SIRI = POR_NOMBRE['SECOP II'], POR_NOMBRE['Procuraduría SIRI']
HOY = date(2026, 10, 31)


def siri(ced, nombre, sancion, fecha, anos='', entidad='POLICIA NACIONAL'):
    p = nombre.split()
    return {'cedula': ced, 'sancionado': nombre, 'primer_nombre': p[0], 'primer_apellido': p[-1], 'tipo_sancion': sancion,
            'fecha_ejecutoria': fecha, 'duracion_anos': anos, 'entidad_sancionado': entidad}


# ── L3 homónimos ─────────────────────────────────────────────────────────────

def test_homonimos_por_nombre_no_se_atribuyen():
    filas = [siri('1', 'CARLOS ANDRES PEREZ ZEA', 'DESTITUCION', '2024-01-10'),
             siri('2', 'CARLOS IVAN PEREZ MERIÑO', 'MULTA', '2025-03-01')]
    d = depurar(SIRI, 'Carlos Perez', '', filas, hoy=HOY)
    assert d['datos'] == [] and len(d['homonimos']) == 2 and d['personas_homonimas'] == 2


def test_una_sola_persona_por_nombre_se_conserva_marcada():
    filas = [siri('1', 'CARLOS ANDRES PEREZ ZEA', 'DESTITUCION', '2024-01-10'),
             siri('1', 'CARLOS ANDRES PEREZ ZEA', 'INHABILIDAD GENERAL', '2024-01-10', anos='10')]
    d = depurar(SIRI, 'Carlos Andres Perez Zea', '', filas, hoy=HOY)
    assert len(d['datos']) == 2 and not d['homonimos'] and d['datos'][0]['_coincidencia'] == 'nombre'


def test_busqueda_por_entidad_no_es_homonimia():
    filas = [siri('1', 'ANA RUIZ', 'MULTA', '2025-01-01', entidad='INSTITUTO NACIONAL DE VIAS - INVIAS'),
             siri('2', 'LUIS GOMEZ', 'MULTA', '2025-01-01', entidad='INSTITUTO NACIONAL DE VIAS - INVIAS')]
    d = depurar(SIRI, 'INVIAS', '', filas, hoy=HOY)
    assert len(d['datos']) == 2 and all(r['_coincidencia'] == 'entidad' for r in d['datos'])


def test_con_cedula_no_hay_homonimia():
    filas = [siri('1', 'CARLOS PEREZ', 'MULTA', '2025-01-01')]
    assert coincidencia(SIRI, 'Carlos Perez', '1', filas[0]) == 'id'
    assert depurar(SIRI, 'Carlos Perez', '1', filas, hoy=HOY)['datos'] == filas


def test_nombre_completo_de_cuatro_palabras_se_busca():
    w, _ = build_where(SIRI, 'Juan Carlos Rodriguez Rivera', '')
    assert "primer_nombre || ' ' || segundo_nombre || ' ' || primer_apellido || ' ' || segundo_apellido" in w


def test_consultar_separa_homonimos_secop():
    filas = [{'nombre_entidad': 'MUNICIPIO X', 'proveedor_adjudicado': 'JUAN CARLOS RODRIGUEZ ARANA', 'documento_proveedor': '11'},
             {'nombre_entidad': 'MUNICIPIO Y', 'proveedor_adjudicado': 'JUAN DAVID RODRIGUEZ RINCON', 'documento_proveedor': '22'}]
    r = consultar(SECOP, 'Juan Rodriguez', '', http=FakeHTTP({'jbjy-vk9h': FakeResp(200, filas)}), sleep=lambda s: None)
    assert r['registros'] == 0 and len(r['homonimos']) == 2 and 'no se atribuyen' in r['mensaje']


# ── L8 vigencia de sanciones ─────────────────────────────────────────────────

def test_sanciones_antiguas_no_vigentes_se_omiten():
    filas = [siri('1', 'A B', 'MULTA', '2005-04-22'),                                 # 21 años, sin duración
             siri('2', 'C D', 'DESTITUCION', '2006-11-09'),
             siri('2', 'C D', 'INHABILIDAD GENERAL', '2006-11-09', anos='20'),       # vigente hasta 2026-11-09
             siri('3', 'E F', 'SUSPENSION', '2023-05-01')]                            # últimos 5 años
    out, retiradas = filtrar_siri(filas, hoy=HOY)
    assert retiradas == 1 and {r['cedula'] for r in out} == {'2', '3'}
    assert all(r['_vigente'] for r in out if r['cedula'] == '2')                      # la destitución va con su inhabilidad
    out2, _ = filtrar_siri([dict(r) for r in filas], hoy=date(2026, 11, 10))
    assert {r['cedula'] for r in out2} == {'3'}


# ── L1 / L2 alertas ──────────────────────────────────────────────────────────

def contrato(prov, nit, modalidad='Contratación directa', coinc='entidad'):
    return {'nombre_del_proveedor': prov, 'nit_del_proveedor_adjudicado': nit, 'modalidad_de_contratacion': modalidad,
            'valor_del_contrato': '1000000', '_coincidencia': coinc}


def test_no_hay_alerta_de_conflicto_por_estar_en_rues():
    res = {'SECOP II': [contrato('CONSTRUCCIONES EL CONDOR', '890', 'Licitación pública')],
           'RUES / Confecámaras': [{'nit': '890', 'razon_social': 'CONSTRUCCIONES EL CONDOR'}]}
    assert not [a for a in detect_alerts(res, {}) if a['id'] == 'A2']


def test_directa_y_dominante_solo_para_contratos_de_la_entidad():
    propios = {'SECOP II': [contrato('JUAN PEREZ', '1', coinc='id') for _ in range(6)]}   # búsqueda por NIT del contratista
    assert detect_alerts(propios, {}) == []
    entidad = {'SECOP II': [contrato('JUAN PEREZ', '1') for _ in range(6)]}
    ids = {a['id'] for a in detect_alerts(entidad, {})}
    assert ids == {'A1', 'A6'}


def test_textos_de_alerta_no_afirman_ilegalidad():
    res = {'SECOP II': [contrato('X', '1') for _ in range(6)],
           'Procuraduría SIRI': [siri('1', 'A B', 'DESTITUCION', '2025-01-01')]}
    for a in detect_alerts(res, {}):
        txt = (a['titulo'] + a['desc'] + a['meta']).lower()
        assert 'viola' not in txt and 'evadiendo' not in txt and 'conflicto' not in txt
        assert '734' not in a['ley']


# ── L7 simulación ────────────────────────────────────────────────────────────

def test_simulacion_sin_fiscalia_ni_imputacion_ni_nombre_real():
    import random
    from app.services import simulation as sim_mod
    assert not any(a['key'] == 'fiscalia' for a in sim_mod.ARQUETIPOS)
    ctx = {'results': {'SECOP II': [{'nombre_del_proveedor': 'PROVEEDOR REAL SAS', 'valor_del_contrato': '1'}]}}
    s = sim_mod.Simulation('t', 'INVIAS', 'esc', 3, 14, '', [], ctx)
    s.hechos = ['h']
    s.generar_agentes(random.Random(1))
    assert not any('PROVEEDOR REAL' in a['nombre'] for a in s.agentes)
    s.simular(lambda r: None); s.correr_ensemble(5)
    assert 'imputacion' not in {d['id'] for d in s.ensemble['desenlaces']}


# ── L10 IA externa ───────────────────────────────────────────────────────────

def test_proveedores_externos_desactivados_por_defecto(monkeypatch):
    from app.utils.llm_router import LLMRouter
    monkeypatch.delenv('LLM_PERMITIR_EXTERNOS', raising=False)
    monkeypatch.setenv('OPENAI_API_KEY', 'sk-test')
    assert LLMRouter.available()['openai'] is False
    with pytest.raises(ValueError, match='Ley 1581'):
        LLMRouter.set_provider('openai')
    monkeypatch.setenv('LLM_PERMITIR_EXTERNOS', 'true')
    assert LLMRouter.available()['openai'] is True
