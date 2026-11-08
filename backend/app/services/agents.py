"""RADAR — Agentes paralelos de búsqueda (patrón MiroFish SimulationManager).

Toda la configuración (datasets, campos, filtros, normalización) vive en app/sources.py.
Cada fuente reporta su estado por separado: ok | vacia | error | no_aplica. El fallo de una fuente
nunca tumba las demás ni se disfraza de «0 registros»."""
import threading
from app.models.task import TaskManager, TaskStatus
from app.sources import FUENTES, POR_NOMBRE, consultar
from app.utils.logger import get_logger

log = get_logger('radar.agents')


class DataAgent:
    name = 'Base'

    @property
    def fuente(self): return POR_NOMBRE[self.name]

    @property
    def source(self): return self.fuente.url

    def fetch(self, query, cedula=''):
        """→ dict de estado de la fuente (incluye 'datos' con los registros normalizados)."""
        r = consultar(self.fuente, query, cedula)
        (log.warning if r['estado'] == 'error' else log.info)(f'[{self.name}] {r["estado"]}: {r["mensaje"]}')
        return r


class SECOPAgent(DataAgent): name = 'SECOP II'
class ProcuraduriaAgent(DataAgent): name = 'Procuraduría SIRI'
class ContraloriaAgent(DataAgent): name = 'Contraloría'
class SIIFAgent(DataAgent): name = 'SIIF Nación'
class SIGEPAgent(DataAgent): name = 'SIGEP / DAFP'
class RUESAgent(DataAgent): name = 'RUES / Confecámaras'

AGENTS = [SECOPAgent, ProcuraduriaAgent, ContraloriaAgent, SIIFAgent, SIGEPAgent, RUESAgent]
assert [A.name for A in AGENTS] == [f.nombre for f in FUENTES], 'agents.py y sources.py deben declarar las mismas fuentes'

# Tiempo máximo por fuente: 3 intentos × 20 s + esperas (1 s + 2 s) + metadatos (10 s)
JOIN_TIMEOUT = 80


class SearchOrchestrator:
    def __init__(self): self.tm = TaskManager()

    def search_async(self, query, cedula=''):
        task_id = self.tm.create_task('search', {'query': query, 'cedula': cedula})
        threading.Thread(target=self._worker, args=(task_id, query, cedula), daemon=True).start()
        return task_id

    def _worker(self, task_id, query, cedula):
        tm = self.tm
        tm.update_task(task_id, status=TaskStatus.PROCESSING, progress=5, message='Iniciando agentes...')
        # Si cédula == query (búsqueda solo por ID desde la API), no se usa como nombre
        nombre = '' if cedula and query == cedula else query
        results, fuentes, homonimos, lock = {}, {}, {}, threading.Lock()

        def run_agent(AgentCls):
            agent = AgentCls()
            try:
                r = agent.fetch(nombre, cedula)
            except Exception as e:                       # nunca debería ocurrir: consultar() captura sus errores
                log.exception(f'[{agent.name}] fallo inesperado')
                r = {'estado': 'error', 'registros': 0, 'mensaje': f'fallo interno: {e}', 'dataset': agent.fuente.dataset, 'datos': []}
            with lock:
                results[agent.name] = r.pop('datos', [])
                h = r.pop('homonimos', [])
                if h:   # registros de homónimos: se muestran aparte y nunca entran en alertas, grafo, score ni informe IA
                    homonimos[agent.name] = {'personas': r.get('personas_homonimas', 0), 'registros': h}
                fuentes[agent.name] = r
                pct = int(len(fuentes) / len(AGENTS) * 85) + 5
                icono = {'ok': '✅', 'vacia': '∅', 'no_aplica': '—'}.get(r['estado'], '⚠')
                tm.update_task(task_id, progress=pct, message=f'{icono} {agent.name}: {r["mensaje"]}')

        threads = [threading.Thread(target=run_agent, args=(A,), daemon=True) for A in AGENTS]
        for t in threads: t.start()
        for t in threads: t.join(timeout=JOIN_TIMEOUT)
        with lock:
            for A in AGENTS:                              # fuentes que no terminaron a tiempo
                if A.name not in fuentes:
                    fuentes[A.name] = {'estado': 'error', 'registros': 0, 'mensaje': 'sin respuesta dentro del tiempo límite',
                                       'dataset': POR_NOMBRE[A.name].dataset}
                    results[A.name] = []
            results = {A.name: results[A.name] for A in AGENTS}
            fuentes = {A.name: fuentes[A.name] for A in AGENTS}

        from app.services.graph_service import build_graph
        from app.services.riesgo import detect_alerts
        graph = build_graph(results)
        alerts = detect_alerts(results, graph)
        total = sum(len(v) for v in results.values())
        n_err = sum(1 for f in fuentes.values() if f['estado'] == 'error')
        msg = f'Búsqueda completada — {total} registros' + (f' · {n_err} fuente(s) con error' if n_err else '')
        tm.update_task(task_id, status=TaskStatus.COMPLETED, progress=100, message=msg,
                       result={'results': results, 'fuentes': fuentes, 'graph': graph, 'alerts': alerts, 'homonimos': homonimos,
                               'errors': {k: v['mensaje'] for k, v in fuentes.items() if v['estado'] == 'error'}})
