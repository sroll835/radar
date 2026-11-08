"""ReportAgent: guard sin datos (sin LLM) y contenido del contexto."""
from app.models.task import TaskManager, TaskStatus
from app.services.report_agent import ReportAgent, construir_contexto, SYSTEM


class LLMQueNoDebeLlamarse:
    def chat(self, *a, **k): raise AssertionError('no debía llamarse al LLM')
    def chat_json(self, *a, **k): raise AssertionError('no debía llamarse al LLM')


class LLMEspia:
    def __init__(self): self.prompts = []
    def chat(self, messages, system='', **k):
        self.prompts.append((system, messages[0]['content'])); return 'respuesta'
    def chat_json(self, messages, system='', **k):
        self.prompts.append((system, messages[0]['content'])); return {'sections': ['Resumen']}


VACIOS = {'SECOP II': [], 'Procuraduría SIRI': [], 'Contraloría': [], 'SIIF Nación': [], 'SIGEP / DAFP': [], 'RUES / Confecámaras': []}
FUENTES_VACIAS = {**{k: {'estado': 'vacia', 'registros': 0, 'mensaje': 'sin registros'} for k in VACIOS},
                  'SIIF Nación': {'estado': 'error', 'registros': 0, 'mensaje': 'error de conexión'}}


def _correr(agent, mode, results, alerts, fuentes):
    tm = TaskManager()
    tid = tm.create_task('report', {})
    agent._worker(tid, 'pregunta' if mode == 'chat' else 'Presidencia', results, alerts, mode, fuentes, 'Presidencia')
    return tm.get_task(tid)


def test_sin_datos_informe_no_llama_al_llm():
    t = _correr(ReportAgent(llm=LLMQueNoDebeLlamarse()), 'summary', VACIOS, [], FUENTES_VACIAS)
    assert t.status == TaskStatus.COMPLETED and t.result['sin_datos']
    txt = t.result['text']
    assert 'Sin datos' in txt and 'SECOP II' in txt and 'SIIF Nación (error de conexión)' in txt
    assert 'ALERTA ROJA' not in txt


def test_sin_datos_chat_no_llama_al_llm():
    t = _correr(ReportAgent(llm=LLMQueNoDebeLlamarse()), 'chat', VACIOS, [], FUENTES_VACIAS)
    assert t.status == TaskStatus.COMPLETED and t.result['sin_datos']


def test_con_datos_contexto_incluye_alertas_leyes_y_fuentes_vacias():
    results = {**VACIOS, 'SECOP II': [{'nombre_del_proveedor': 'BORVILL SAS', 'nombre_entidad': 'DAPRE', 'valor_del_contrato': '2500000000',
                                       'modalidad_de_contratacion': 'Contratación directa', 'fecha_de_firma': '2025-02-01T00:00:00'}]}
    alerts = [{'severity': 'ALTO', 'titulo': '100% de contratos por Contratación Directa', 'ley': 'Art. 2 Ley 1150/2007',
               'desc': 'Valor sin proceso competitivo: $2.5B.'}]
    fuentes = {**FUENTES_VACIAS, 'SECOP II': {'estado': 'ok', 'registros': 1, 'mensaje': '1 registros'}}
    ctx = construir_contexto('Presidencia', results, alerts, fuentes)
    assert '[ALTO] 100% de contratos por Contratación Directa' in ctx
    assert 'LEY: Art. 2 Ley 1150/2007' in ctx and 'Valor sin proceso competitivo' in ctx
    assert 'FUENTES SIN REGISTROS: Procuraduría SIRI, Contraloría, SIIF Nación, SIGEP / DAFP, RUES / Confecámaras' in ctx
    assert 'SIIF Nación: error (0 registros) — error de conexión' in ctx
    assert 'BORVILL SAS' in ctx

    espia = LLMEspia()
    t = _correr(ReportAgent(llm=espia), 'chat', results, alerts, fuentes)
    assert t.status == TaskStatus.COMPLETED and t.result['text'] == 'respuesta'
    system, prompt = espia.prompts[0]
    assert system == SYSTEM and 'LEY: Art. 2 Ley 1150/2007' in prompt and 'FUENTES SIN REGISTROS' in prompt


def test_sin_alertas_altas_el_contexto_prohibe_alerta_roja():
    results = {**VACIOS, 'SIGEP / DAFP': [{'nombre_entidad': 'DAPRE', 'nombre_cargo': 'ASESOR', 'cargo_nivel': 'Asesor', 'asignacion_basica': '9000000'}]}
    ctx = construir_contexto('Presidencia', results, [{'severity': 'MEDIO', 'titulo': 't', 'ley': 'EOP Art. 38', 'desc': 'd'}])
    assert 'no escribas ALERTA ROJA' in ctx


def test_prompt_sistema_reglas_clave():
    for frase in ('SOLO', '"típicos"', 'ALERTA ROJA', 'LEY', 'Fuentes sin registros', 'No pidas datos', 'no condenas penales'):
        assert frase in SYSTEM


def test_contexto_truncado():
    big = {**VACIOS, 'SECOP II': [{'nombre_del_proveedor': 'X' * 900, 'valor_del_contrato': '1'}] * 5}
    alerts = [{'severity': 'MEDIO', 'titulo': 'T' * 600, 'ley': 'L', 'desc': 'D'}] * 20
    ctx = construir_contexto('q', big, alerts)
    assert len(ctx) <= 6000 + 40 and ctx.endswith('[contexto truncado]')
