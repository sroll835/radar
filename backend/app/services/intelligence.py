"""RADAR v7 — Módulo Inteligencia: 7 agentes integrados + orquestador.

Cada agente: recolecta evidencia real (noticias RSS públicas + resultados de la
búsqueda RADAR si existen) y la sintetiza (LLM si hay clave; si no, análisis por
reglas sobre la misma evidencia). NUNCA inventa datos: sin evidencia => confianza baja
y lo dice explícitamente."""
import threading, time, xml.etree.ElementTree as ET
from urllib.parse import quote
import requests
from app.models.task import TaskManager, TaskStatus
from app.utils.llm_router import LLMRouter
from app.utils.logger import setup_logger

log = setup_logger('intel')
tm = TaskManager()
SYSTEM = ('Eres un analista de inteligencia de RADAR (anticorrupción Colombia). Usa SOLO la evidencia '
          'entregada; si es insuficiente dilo. Responde JSON válido en español.')

def _news(query, n=8):
    """Titulares recientes de Google News RSS (fuente pública)."""
    try:
        url = f'https://news.google.com/rss/search?q={quote(query)}&hl=es-419&gl=CO&ceid=CO:es-419'
        r = requests.get(url, timeout=12, headers={'User-Agent': 'RADAR/7'})
        r.raise_for_status()
        out = []
        for it in ET.fromstring(r.content).iter('item'):
            out.append({'titulo': (it.findtext('title') or '').strip(), 'fuente': (it.findtext('source') or 'Google News'),
                        'fecha': (it.findtext('pubDate') or '')[:25], 'url': it.findtext('link') or ''})
            if len(out) >= n: break
        return out
    except Exception as e:
        log.warning('news fail %s', e); return []

class IntelligenceAgent:
    id = ''; name = ''; icon = ''; topics = ''
    def evidence(self, query, ctx):
        q = f'{query} {self.topics}'.strip()
        return {'noticias': _news(q), 'radar': {}}
    def run(self, query, ctx):
        ev = self.evidence(query, ctx)
        n = len(ev['noticias']) + len(ev['radar'].get('alertas', []))
        res = None
        if LLMRouter.enabled():
            try: res = self._llm(query, ev)
            except Exception as e: log.warning('%s LLM fail: %s', self.id, e)
        if res is None: res = self._rules(query, ev)
        conf = min(90, 20 + n * 6) if n else 10
        if res.get('_llm'): conf = min(95, conf + 8)
        res.pop('_llm', None)
        fuentes = [{'titulo': x['titulo'], 'fuente': x['fuente'], 'url': x['url']} for x in ev['noticias']]
        if ev['radar'].get('alertas'): fuentes.append({'titulo': 'Motor de riesgo RADAR (SECOP/SIRI/Contraloría/SIIF)', 'fuente': 'RADAR', 'url': ''})
        return {'id': self.id, 'agente': self.name, 'icon': self.icon, 'evidencias': n,
                'confianza': conf, 'fuentes': fuentes,
                'resumen': res.get('resumen', ''), 'analisis': res.get('analisis', ''),
                'predicciones': res.get('predicciones', []), 'modo': 'llm:' + LLMRouter.active() if LLMRouter.enabled() and res.get('_m') != 'r' else 'reglas'}
    def _llm(self, query, ev):
        heads = '\n'.join(f'- {x["titulo"]} ({x["fuente"]}, {x["fecha"]})' for x in ev['noticias']) or '(sin noticias)'
        radar = ev['radar'] or {}
        prompt = (f'Agente: {self.name}. Consulta: "{query}".\nTitulares:\n{heads}\n'
                  f'Datos RADAR: {radar}\n\nDevuelve JSON: {{"resumen":"2 frases","analisis":"párrafo",'
                  f'"predicciones":[{{"evento":"","probabilidad":0-100,"horizonte":""}}]}} (máx 3 predicciones, '
                  f'probabilidades prudentes y justificadas por la evidencia).')
        r = LLMRouter.chat_json(prompt, SYSTEM)
        r['_llm'] = True
        return r
    def _rules(self, query, ev):
        nn = ev['noticias']
        if not nn and not ev['radar']:
            return {'resumen': 'Sin evidencia disponible para esta consulta.', 'analisis': 'No se obtuvieron fuentes. Verifica conexión a internet o configura un LLM.', 'predicciones': [], '_m': 'r'}
        t = ' '.join(x['titulo'].lower() for x in nn)
        neg = sum(t.count(w) for w in ('denuncia', 'investig', 'sancion', 'escándalo', 'corrup', 'captur', 'crisis', 'ataque', 'violen'))
        resumen = f'{len(nn)} noticias recientes sobre «{query or self.topics}»; {neg} menciones de términos de riesgo.'
        analisis = 'Titulares destacados: ' + ' | '.join(x['titulo'] for x in nn[:3]) if nn else 'Solo datos internos RADAR.'
        preds = [{'evento': 'Continuidad de cobertura mediática negativa', 'probabilidad': min(80, 30 + neg * 6), 'horizonte': '30 días'}] if neg else []
        return {'resumen': resumen, 'analisis': analisis, 'predicciones': preds, '_m': 'r'}

class Geo(IntelligenceAgent):
    id='geopolitico'; name='Agente Geopolítico'; icon='🌐'; topics='Colombia relaciones internacionales frontera'
class Eco(IntelligenceAgent):
    id='economico'; name='Agente Económico'; icon='📈'; topics='Colombia economía inflación presupuesto deuda'
class Leg(IntelligenceAgent):
    id='legislativo'; name='Agente Legislativo'; icon='🏛️'; topics='Congreso Colombia proyecto de ley'
class Ele(IntelligenceAgent):
    id='electoral'; name='Agente Electoral'; icon='🗳️'; topics='Registraduría elecciones Colombia CNE'
class Seg(IntelligenceAgent):
    id='seguridad'; name='Agente Seguridad'; icon='🛡️'; topics='Colombia seguridad orden público'

class Corr(IntelligenceAgent):
    id='corrupcion'; name='Agente Corrupción'; icon='🔎'; topics='corrupción investigación Procuraduría Fiscalía'
    def evidence(self, query, ctx):
        ev = super().evidence(query, ctx)
        a = ctx.get('alerts') or []
        ev['radar'] = {'alertas': [{'tipo': x.get('titulo') or x.get('id'), 'severidad': x.get('severity')} for x in a[:12]],
                       'sanciones': len((ctx.get('results') or {}).get('Procuraduría SIRI', [])),
                       'fiscales': len((ctx.get('results') or {}).get('Contraloría', []))}
        return ev

class Contr(IntelligenceAgent):
    id='contratacion'; name='Agente Contratación Pública'; icon='📄'; topics='SECOP contratación directa licitación Colombia'
    def evidence(self, query, ctx):
        ev = super().evidence(query, ctx)
        res = ctx.get('results') or {}
        c = res.get('SECOP II', [])
        ev['radar'] = {'contratos': len(c), 'alertas': [{'tipo': x.get('titulo') or x.get('id'), 'severidad': x.get('severity')}
                       for x in (ctx.get('alerts') or []) if str(x.get('source', 'SECOP')).upper().startswith('SECOP')][:12]}
        return ev

AGENTS = [Geo, Eco, Leg, Ele, Seg, Corr, Contr]

class IntelligenceOrchestrator:
    def run_async(self, query, search_ctx=None):
        tid = tm.create_task('intelligence', {'query': query})
        threading.Thread(target=self._run, args=(tid, query, search_ctx or {}), daemon=True).start()
        return tid
    def _run(self, tid, query, ctx):
        tm.update_task(tid, status=TaskStatus.PROCESSING, progress=5, message='Lanzando 7 agentes...')
        out, lock = [], threading.Lock()
        def work(A):
            a = A()
            try: r = a.run(query, ctx)
            except Exception as e:
                r = {'id': a.id, 'agente': a.name, 'icon': a.icon, 'error': str(e), 'confianza': 0, 'resumen': 'Error del agente', 'analisis': str(e), 'predicciones': [], 'fuentes': []}
            with lock:
                out.append(r)
                tm.update_task(tid, progress=5 + int(85 * len(out) / len(AGENTS)), message=f'{len(out)}/{len(AGENTS)} agentes listos')
        ts = [threading.Thread(target=work, args=(A,)) for A in AGENTS]
        # timeout amplio: con un modelo local (Ollama) los 7 agentes se atienden en cola
        [t.start() for t in ts]; [t.join(timeout=900) for t in ts]
        order = {A.id: i for i, A in enumerate(AGENTS)}
        out.sort(key=lambda r: order.get(r['id'], 99))
        tm.update_task(tid, progress=95, message='Sintetizando resumen ejecutivo...')
        tm.update_task(tid, status=TaskStatus.COMPLETED, progress=100, message='Completado',
                       result={'query': query, 'agentes': out, 'ejecutivo': self._exec(query, out)})
    def _exec(self, query, ag):
        ok = [a for a in ag if not a.get('error')]
        conf = round(sum(a['confianza'] for a in ok) / len(ok)) if ok else 0
        preds = sorted([dict(p, agente=a['agente']) for a in ok for p in a.get('predicciones', []) if isinstance(p, dict)],
                       key=lambda p: -(p.get('probabilidad') or 0))[:5]
        con = [a for a in ok if a.get('evidencias')]
        texto = ' '.join(a['resumen'] for a in con) if con else 'Sin evidencia disponible: revisa la conexión a internet o configura un LLM.'
        if LLMRouter.enabled() and con:
            try:
                texto = LLMRouter.chat('Redacta un resumen ejecutivo (máx 6 líneas) integrando estos hallazgos de 7 agentes, '
                    'sin añadir hechos nuevos:\n' + '\n'.join(f'{a["agente"]}: {a["resumen"]}' for a in con), SYSTEM.replace('JSON válido', 'texto'))
            except Exception as e: log.warning('exec llm: %s', e)
        return {'texto': texto, 'confianza': conf, 'top_predicciones': preds, 'agentes_ok': len(ok), 'agentes_total': len(ag)}
