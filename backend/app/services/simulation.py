"""RADAR v8 — Simulación de enjambre (adaptación del flujo MiroFish al dominio anticorrupción).

Fases:
  1. Grafo semilla   — entidades de la búsqueda RADAR + titulares de prensa + texto aportado por el usuario.
  2. Agentes         — ecosistema simulado (prensa, veedurías, entes de control, política, entidad, ciudadanos)
                       con postura, influencia, actividad y memoria propia.
  3. Simulación      — rondas en dos plataformas ("red" social y "foro" de prensa); cada acción altera
                       métricas globales (atención, presión institucional, sentimiento hacia la entidad).
                       Se pueden inyectar eventos antes o durante la ejecución.
  4. Predicción      — conjunto de corridas rápidas por reglas (Monte Carlo) para estimar la frecuencia de
                       cada desenlace; el ReportAgent (ReACT con herramientas) redacta el informe sobre esos datos.
  5. Interacción     — chat con cualquier agente simulado o con el ReportAgent.

Con LLM los agentes redactan sus mensajes; sin LLM se usan plantillas. La dinámica de métricas es siempre la
misma función de reglas, de modo que las probabilidades no dependen de cifras inventadas por el modelo.
Los agentes son ficticios: no representan declaraciones reales de personas ni entidades."""
import copy, hashlib, json, math, random, threading, uuid
from app.models.task import TaskManager, TaskStatus
from app.utils.llm_router import LLMRouter
from app.utils.logger import setup_logger
from app.services.intelligence import _news

log = setup_logger('simulation')
tm = TaskManager()
SIMS = {}               # sim_id → Simulation (para interacción posterior)
_MAX_SIMS = 30

ARQUETIPOS = [
    dict(key='periodista', rol='Periodista investigativo', tipo='medio', postura=.6, influencia=.7, actividad=.8, plataforma='foro',
         acciones=['publicar', 'solicitar_informacion', 'responder']),
    dict(key='medio', rol='Medio de comunicación nacional', tipo='medio', postura=.25, influencia=.9, actividad=.5, plataforma='foro',
         acciones=['publicar', 'compartir']),
    dict(key='veeduria', rol='Veeduría ciudadana', tipo='sociedad', postura=.7, influencia=.45, actividad=.7, plataforma='red',
         acciones=['denunciar', 'publicar', 'solicitar_informacion']),
    dict(key='entidad', rol='Vocero de la entidad (simulado)', tipo='implicado', postura=-.8, influencia=.6, actividad=.6, plataforma='foro',
         acciones=['comunicado', 'responder', 'guardar_silencio']),
    # Los entes de control se nombran de forma genérica y marcados como simulados: la simulación no debe poner
    # palabras en boca de autoridades reales ni anticipar decisiones penales (presunción de inocencia, Const. art. 29).
    dict(key='procuraduria', rol='Ente de control disciplinario (simulado)', tipo='institucion', postura=.1, influencia=.9, actividad=.4, plataforma='foro',
         acciones=['comunicado', 'abrir_indagacion']),
    dict(key='oposicion', rol='Congresista de oposición', tipo='politico', postura=.8, influencia=.7, actividad=.6, plataforma='red',
         acciones=['publicar', 'citar_debate', 'denunciar']),
    dict(key='contraloria', rol='Ente de control fiscal (simulado)', tipo='institucion', postura=.1, influencia=.85, actividad=.35, plataforma='foro',
         acciones=['comunicado', 'abrir_indagacion']),
    dict(key='oficialismo', rol='Congresista oficialista', tipo='politico', postura=-.5, influencia=.6, actividad=.5, plataforma='red',
         acciones=['publicar', 'responder']),
    dict(key='contratista', rol='Contratista (simulado)', tipo='implicado', postura=-.9, influencia=.35, actividad=.3, plataforma='red',
         acciones=['comunicado', 'guardar_silencio']),
    dict(key='ong', rol='ONG de transparencia', tipo='sociedad', postura=.5, influencia=.55, actividad=.4, plataforma='foro',
         acciones=['publicar', 'denunciar']),
]
NOMBRES = ['Laura M.', 'Andrés P.', 'Camila R.', 'Jorge T.', 'Valentina G.', 'Felipe S.', 'Diana C.', 'Mateo V.',
           'Sofía L.', 'Carlos H.', 'Paula N.', 'Julián O.', 'Natalia B.', 'Sebastián A.', 'Mariana D.', 'Óscar F.']
ACCION_TXT = {'publicar': 'publica', 'responder': 'responde', 'compartir': 'comparte', 'denunciar': 'radica denuncia',
              'solicitar_informacion': 'presenta derecho de petición', 'comunicado': 'emite comunicado',
              'guardar_silencio': 'guarda silencio', 'citar_debate': 'cita a debate de control',
              'abrir_indagacion': 'ABRE INDAGACIÓN'}

PLANTILLAS = {
    'publicar': ['Los datos son claros: {hecho}. ¿Quién responde por esto en {entidad}?',
                 'Revisando la información pública de {entidad}: {hecho}. Hay que hacer seguimiento.',
                 '{hecho}. Esto merece explicaciones de {entidad}.'],
    'publicar-': ['Se está exagerando con {entidad}: {hecho} no prueba ninguna irregularidad.',
                  'Antes de condenar a {entidad} hay que esperar a los entes de control.'],
    'responder': ['Respondo: el punto central sigue siendo que {hecho}.', 'No es cierto que todo esté en regla: {hecho}.'],
    'responder-': ['Eso es sacado de contexto; los procesos de {entidad} cumplieron la ley.'],
    'compartir': ['Compartiendo: {hecho} #{tag}', 'Atención a esto sobre {entidad} → {hecho}'],
    'denunciar': ['Radicamos denuncia formal ante los entes de control por: {hecho}.'],
    'solicitar_informacion': ['Presenté derecho de petición a {entidad} pidiendo soportes sobre: {hecho}.'],
    'comunicado': ['{entidad} informa que todos sus procesos se ajustan a la normativa vigente y está dispuesta a entregar información.'],
    'comunicado-inst': ['Estamos evaluando la información conocida sobre {entidad}. Actuaremos dentro de nuestras competencias.'],
    'guardar_silencio': ['(Sin pronunciamiento público)'],
    'citar_debate': ['Cité a debate de control político a {entidad} por: {hecho}.'],
    'abrir_indagacion': ['Se abre indagación preliminar relacionada con {entidad} para verificar: {hecho}.'],
}

clamp = lambda v, a, b: max(a, min(b, v))


def _semilla(query):
    return int(hashlib.sha1((query or 'radar').encode()).hexdigest()[:8], 16)


class Simulation:
    def __init__(self, sim_id, query, escenario, rondas, n_agentes, semilla_txt, eventos, ctx):
        self.id = sim_id
        self.query = query or 'la entidad'
        self.escenario = escenario
        self.rondas = int(clamp(int(rondas or 12), 3, 40))
        self.n_agentes = int(clamp(int(n_agentes or 14), 8, 30))
        self.semilla_txt = (semilla_txt or '').strip()[:6000]
        self.eventos = {int(e['ronda']): e['texto'] for e in (eventos or []) if e.get('texto')}
        self.pendientes = []       # eventos inyectados en caliente
        self.ctx = ctx or {}
        self.hechos, self.noticias, self.grafo = [], [], {'nodes': [], 'edges': []}
        self.agentes, self.feed, self.timeline, self.hitos = [], [], [], []
        self.estado = {}
        self.ensemble, self.informe, self.fase, self.modo = None, None, 'grafo', 'reglas'
        self.lock = threading.Lock()
        self._resp = {}            # agente → id del post al que responde (lo indica el LLM)

    # ── FASE 1: grafo semilla ──────────────────────────────────────────
    def construir_grafo(self):
        res = self.ctx.get('results') or {}
        c, proc, cont = res.get('SECOP II', []), res.get('Procuraduría SIRI', []), res.get('Contraloría', [])
        alerts = self.ctx.get('alerts') or []
        val = sum(float(x.get('valor_del_contrato') or 0) for x in c)
        if c:
            self.hechos.append(f'{len(c)} contratos SECOP por ${val / 1e9:,.1f} mil millones')
            directos = [x for x in c if 'directa' in (x.get('modalidad_de_contratacion') or '').lower()]
            if directos: self.hechos.append(f'{round(len(directos) / len(c) * 100)}% de los contratos fueron por contratación directa')
        if proc: self.hechos.append(f'{len(proc)} sanciones disciplinarias registradas en la Procuraduría')
        if cont:
            cu = sum(float(x.get('cuantia_fallo') or 0) for x in cont)
            self.hechos.append(f'{len(cont)} procesos de responsabilidad fiscal por ${cu / 1e6:,.0f} millones')
        self.hechos += [a.get('titulo', '') for a in alerts if a.get('titulo')][:5]

        self.noticias = _news(self.query, 6) if self.query else []
        self.hechos += [f'Prensa: {n["titulo"]}' for n in self.noticias[:4]]

        g = self.ctx.get('graph') or {}
        nodes = [dict(n) for n in g.get('nodes', [])][:60]
        ids = {(n.get('data') or n).get('id') for n in nodes}
        edges = [dict(e) for e in g.get('edges', []) if (e.get('data') or e).get('source') in ids and (e.get('data') or e).get('target') in ids]

        if self.semilla_txt:
            extra = self._extraer_semilla()
            for i, ent in enumerate(extra.get('entidades', [])[:12]):
                nid = f'sem_{i}'
                nodes.append({'data': {'id': nid, 'type': 'semilla', 'label': str(ent.get('nombre', ''))[:28], 'size': 26,
                                       'risk': '', 'subLabel': ent.get('tipo', 'Entidad del documento'), 'color': '#ff6d00'}})
                ids.add(nid)
            names = {str(e.get('nombre')): f'sem_{i}' for i, e in enumerate(extra.get('entidades', [])[:12])}
            for j, r in enumerate(extra.get('relaciones', [])[:20]):
                a, b = names.get(str(r.get('origen'))), names.get(str(r.get('destino')))
                if a and b:
                    edges.append({'data': {'id': f'semr_{j}', 'source': a, 'target': b, 'color': '#ff6d00', 'w': 1.5,
                                           'etype': r.get('tipo', 'relación'), 'elabel': ''}})
            self.hechos += [f'Documento: {h}' for h in extra.get('hechos', [])[:6]]
        if not self.hechos:
            self.hechos = [f'Hay preguntas abiertas sobre la contratación de {self.query}']
        self.grafo = {'nodes': nodes, 'edges': edges}

    def _extraer_semilla(self):
        """Extrae entidades/relaciones/hechos del texto aportado (LLM) o frases clave (reglas)."""
        if LLMRouter.enabled():
            try:
                return LLMRouter.chat_json(
                    'Extrae del siguiente texto un grafo de conocimiento. Responde JSON: {"entidades":[{"nombre":"","tipo":""}],'
                    '"relaciones":[{"origen":"","destino":"","tipo":""}],"hechos":["frase corta verificable del texto"]}. '
                    'Usa SOLO lo que dice el texto.\n\nTEXTO:\n' + self.semilla_txt,
                    'Eres un extractor de información. No inventes datos.', max_tokens=1200)
            except Exception as e:
                log.warning('extracción semilla LLM: %s', e)
        frases = [f.strip() for f in self.semilla_txt.replace('\n', '. ').split('. ') if len(f.strip()) > 30]
        return {'entidades': [], 'relaciones': [], 'hechos': frases[:6]}

    # ── FASE 2: agentes ────────────────────────────────────────────────
    def generar_agentes(self, rng):
        riesgo = min(1.0, len(self.hechos) / 10)
        base = ARQUETIPOS[:min(len(ARQUETIPOS), self.n_agentes - 3)]
        agentes = []
        for i, a in enumerate(base):
            # El contratista nunca lleva el nombre real del proveedor: es un personaje ficticio
            nombre = {'entidad': f'Vocería {self.query} (simulada)'}.get(a['key'], a['rol'])
            agentes.append(dict(id=f'a{i}', key=a['key'], nombre=nombre, rol=a['rol'], tipo=a['tipo'],
                                postura=a['postura'], postura0=a['postura'], influencia=a['influencia'], actividad=a['actividad'],
                                plataforma=a['plataforma'], acciones=a['acciones'], memoria=[], bio=''))
        for j in range(self.n_agentes - len(agentes)):
            p = clamp(rng.gauss(0.15 + 0.4 * riesgo, 0.45), -1, 1)
            agentes.append(dict(id=f'a{len(agentes)}', key='ciudadano', nombre=NOMBRES[j % len(NOMBRES)] + ' (ciudadano)',
                                rol='Ciudadano en redes', tipo='ciudadano', postura=round(p, 2), postura0=round(p, 2),
                                influencia=round(rng.uniform(.1, .35), 2), actividad=round(rng.uniform(.3, .8), 2),
                                plataforma='red', acciones=['publicar', 'compartir', 'responder'], memoria=[], bio=''))
        self.agentes = agentes
        self._bios(rng)
        # nodos de agentes en el grafo (vinculados a la entidad/proveedor cuando existen)
        ent_id = next(((n.get('data') or n)['id'] for n in self.grafo['nodes'] if (n.get('data') or n).get('type') in ('entidad', 'ent')), None)
        prov_id = next(((n.get('data') or n)['id'] for n in self.grafo['nodes'] if (n.get('data') or n).get('type') == 'prov'), None)
        for a in agentes:
            if a['tipo'] == 'ciudadano': continue
            self.grafo['nodes'].append({'data': {'id': 'ag_' + a['id'], 'type': 'agente', 'label': a['nombre'][:28], 'size': 22,
                                                 'risk': '', 'subLabel': 'AGENTE SIMULADO · ' + a['rol'], 'color': '#e040fb'}})
            tgt = prov_id if a['key'] == 'contratista' else ent_id
            if tgt:
                self.grafo['edges'].append({'data': {'id': 'age_' + a['id'], 'source': 'ag_' + a['id'], 'target': tgt,
                                                     'color': '#e040fb', 'w': 1, 'etype': 'observa', 'elabel': ''}})

    def _bios(self, rng):
        if LLMRouter.enabled():
            try:
                lista = [{'id': a['id'], 'rol': a['rol'], 'postura': a['postura']} for a in self.agentes]
                r = LLMRouter.chat_json(
                    f'Escenario: {self.escenario}\nEntidad: {self.query}\nHechos: {self.hechos[:8]}\n'
                    f'Agentes: {json.dumps(lista, ensure_ascii=False)}\n'
                    'Para cada agente escribe una biografía ficticia de 1 frase y su objetivo en el escenario. '
                    'postura: -1 defiende a la entidad, +1 la cuestiona. No uses nombres de personas reales. '
                    'Responde JSON: {"agentes":[{"id":"a0","bio":"","objetivo":""}]}',
                    'Diseñas personajes para una simulación social. Español.', max_tokens=1600)
                by = {x.get('id'): x for x in r.get('agentes', [])}
                for a in self.agentes:
                    if a['id'] in by:
                        a['bio'] = str(by[a['id']].get('bio', ''))[:240]; a['objetivo'] = str(by[a['id']].get('objetivo', ''))[:200]
                return
            except Exception as e:
                log.warning('bios LLM: %s', e)
        for a in self.agentes:
            lado = 'cuestiona' if a['postura'] > 0.2 else 'defiende' if a['postura'] < -0.2 else 'observa con cautela'
            a['bio'] = f'{a["rol"]} que {lado} la gestión de {self.query}.'
            a['objetivo'] = {'institucion': 'Actuar solo si hay mérito probatorio.', 'implicado': 'Proteger la reputación de la entidad.',
                             'medio': 'Informar y ganar audiencia.', 'politico': 'Capitalizar el caso políticamente.'}.get(a['tipo'], 'Opinar sobre el caso.')

    # ── FASE 3: dinámica (común a la corrida narrada y al ensemble) ──────
    @staticmethod
    def estado_inicial(n_hechos, n_noticias):
        # fuerza: cuánto respaldo documental tiene el caso (0.15 débil … 1 fuerte); modula la presión que genera el debate
        return {'atencion': clamp(8 + 2.5 * n_hechos + 2 * n_noticias, 5, 45), 'presion': 5.0, 'sentimiento': -0.05,
                'fuerza': clamp(n_hechos / 8, 0.15, 1.0),
                'indagacion': False, 'debate': False, 'denuncias': 0, 'ronda': 0}

    @staticmethod
    def elegir_accion(a, st, rng):
        if rng.random() > a['actividad'] * (0.6 + st['atencion'] / 120): return None
        if a['tipo'] == 'institucion':
            umbral = 40 + (1 - a['influencia']) * 20 + rng.uniform(-8, 8)
            if not st['indagacion'] and st['presion'] > umbral and rng.random() < .55: return 'abrir_indagacion'
            return 'comunicado' if rng.random() < .3 else None
        if a['tipo'] == 'implicado':
            return 'comunicado' if st['atencion'] > 30 and rng.random() < .55 else ('responder' if 'responder' in a['acciones'] and rng.random() < .3 else 'guardar_silencio')
        if 'citar_debate' in a['acciones'] and not st['debate'] and st['atencion'] > 38 and rng.random() < .4: return 'citar_debate'
        if 'denunciar' in a['acciones'] and a['postura'] > .4 and rng.random() < .3: return 'denunciar'
        opts = [x for x in a['acciones'] if x not in ('denunciar', 'citar_debate')]
        return rng.choice(opts)

    @staticmethod
    def aplicar(st, a, accion, rng):
        inf, p, fz = a['influencia'], a['postura'], st['fuerza']
        if accion in ('publicar', 'responder', 'compartir'):
            st['atencion'] += (0.6 if accion == 'publicar' else .35) * (0.5 + inf * 2) * (0.5 + abs(p))
            st['presion'] += max(0, p) * inf * 1.25 * (0.3 + fz)
        elif accion == 'denunciar':
            st['denuncias'] += 1; st['presion'] += (3 + 4 * inf) * (0.3 + fz); st['atencion'] += 1.5
        elif accion == 'solicitar_informacion':
            st['presion'] += 1.5 * inf * (0.3 + fz)
        elif accion == 'citar_debate':
            st['debate'] = True; st['presion'] += 6 * (0.3 + fz); st['atencion'] += 5
        elif accion == 'comunicado':
            if a['tipo'] == 'implicado':
                st['sentimiento'] += .06 * inf if st['atencion'] < 55 else .02
                st['atencion'] += 1.5
            else:
                st['atencion'] += 2; st['presion'] += 1.5
        elif accion == 'guardar_silencio':
            if st['atencion'] > 45: st['sentimiento'] -= .03
        elif accion == 'abrir_indagacion':
            st['indagacion'] = True; st['presion'] += 15; st['atencion'] += 10
        # sentimiento hacia la entidad: tiende hacia –postura ponderada por influencia
        st['sentimiento'] += (-p) * inf * 0.04 * (0.3 + fz)

    @staticmethod
    def cierre_ronda(st, agentes, acciones_ronda):
        st['atencion'] = clamp(st['atencion'] * 0.9, 0, 100)
        st['presion'] = clamp(st['presion'] * 0.92, 0, 100)
        st['sentimiento'] = clamp(st['sentimiento'] * 0.98, -1, 1)
        # contagio de postura: los ciudadanos se mueven hacia la postura media de lo publicado
        voces = [(a['postura'], a['influencia']) for a, acc in acciones_ronda if acc in ('publicar', 'compartir', 'responder', 'denunciar', 'comunicado')]
        if voces:
            media = sum(p * w for p, w in voces) / max(1e-6, sum(w for _, w in voces))
            for a in agentes:
                k = .12 if a['tipo'] == 'ciudadano' else .02
                a['postura'] = round(clamp(a['postura'] + k * (media - a['postura']), -1, 1), 3)
        st['ronda'] += 1

    @staticmethod
    def aplicar_evento(st, texto):
        t = texto.lower()
        if any(w in t for w in ('captur', 'imput', 'allanamiento', 'fiscal')): st['presion'] += 18; st['atencion'] += 15
        elif any(w in t for w in ('archiv', 'absuel', 'desmient', 'aclara')): st['presion'] -= 12; st['sentimiento'] += .15
        else: st['atencion'] += 10; st['presion'] += 6

    # ── corrida narrada ────────────────────────────────────────────────
    def simular(self, progress):
        rng = random.Random(_semilla(self.query + self.escenario))
        st = self.estado_inicial(len(self.hechos), len(self.noticias))
        self.estado = st
        self.timeline.append(self._snap(st))
        usar_llm = LLMRouter.enabled()
        self.modo = 'llm:' + LLMRouter.active() if usar_llm else 'reglas'
        for r in range(1, self.rondas + 1):
            eventos = ([self.eventos[r]] if r in self.eventos else []) + self._tomar_pendientes()
            for ev in eventos:
                self.aplicar_evento(st, ev)
                self._post(None, 'evento', f'⚡ EVENTO: {ev}', r, 'foro')
                self.hitos.append({'ronda': r, 'texto': ev, 'tipo': 'evento'})
            plan = [(a, self.elegir_accion(a, st, rng)) for a in self.agentes]
            plan = [(a, acc) for a, acc in plan if acc]
            hablan = [(a, acc) for a, acc in plan if acc != 'guardar_silencio']
            textos = self._redactar_llm(r, hablan, st) if usar_llm and hablan else {}
            for a, acc in plan:
                antes = (st['indagacion'], st['debate'])
                self.aplicar(st, a, acc, rng)
                if acc == 'guardar_silencio':
                    a['memoria'].append(f'R{r}: guardé silencio'); continue
                txt = textos.get(a['id']) or self._plantilla(a, acc, rng)
                post = self._post(a, acc, txt, r, a['plataforma'], rng)
                a['memoria'].append(f'R{r}: {ACCION_TXT[acc]} — {txt[:140]}')
                despues = (st['indagacion'], st['debate'])
                if despues != antes:
                    self.hitos.append({'ronda': r, 'texto': f'{a["nombre"]} {ACCION_TXT[acc]}', 'tipo': acc})
                if post.get('responde_a'):
                    tgt = next((x for x in self.feed if x['id'] == post['responde_a']), None)
                    ag = next((x for x in self.agentes if tgt and x['id'] == tgt.get('agente')), None)
                    if ag: ag['memoria'].append(f'R{r}: {a["nombre"]} me respondió — {txt[:100]}')
            self.cierre_ronda(st, self.agentes, plan)
            self.timeline.append(self._snap(st))
            progress(r)

    def _tomar_pendientes(self):
        with self.lock:
            p, self.pendientes = self.pendientes, []
        return p

    def _redactar_llm(self, r, plan, st):
        feed = '\n'.join(f'[{p["id"]}] {p["nombre"]} ({p["plataforma"]}): {p["texto"][:160]}' for p in self.feed[-8:]) or '(vacío)'
        lista = '\n'.join(f'- {a["id"]} | {a["nombre"]} | {a["rol"]} | postura {a["postura"]:+.2f} | acción: {acc} | '
                          f'memoria: {" / ".join(a["memoria"][-2:]) or "—"}' for a, acc in plan)
        prompt = (f'ESCENARIO: {self.escenario}\nENTIDAD: {self.query}\nHECHOS VERIFICADOS (úsalos, no inventes otros): '
                  f'{json.dumps(self.hechos[:10], ensure_ascii=False)}\nRONDA {r}/{self.rondas} · atención {st["atencion"]:.0f}/100 · '
                  f'presión institucional {st["presion"]:.0f}/100 · indagación abierta: {st["indagacion"]}\n'
                  f'ÚLTIMOS MENSAJES:\n{feed}\n\nAGENTES QUE ACTÚAN Y SU ACCIÓN:\n{lista}\n\n'
                  'Escribe el mensaje de cada agente (máx 240 caracteres, tono acorde a su rol y postura; -1 defiende, +1 cuestiona). '
                  'Puede responder a un mensaje previo indicando su id. Responde JSON: '
                  '{"mensajes":[{"agente":"a0","texto":"","responde_a":null}]}')
        try:
            out = LLMRouter.chat_json(prompt, 'Simulas una red social sobre un caso de control público en Colombia. '
                                              'Los personajes son ficticios. No atribuyas delitos como hechos probados.',
                                      temperature=0.8, max_tokens=1800)
            res = {}
            for m in out.get('mensajes', []):
                res[m.get('agente')] = str(m.get('texto', ''))[:280]
                self._resp[m.get('agente')] = m.get('responde_a')
            return res
        except Exception as e:
            log.warning('ronda %s LLM: %s', r, e)
            return {}

    def _plantilla(self, a, acc, rng):
        key = acc
        if acc in ('publicar', 'responder') and a['postura'] < -0.2: key = acc + '-'
        if acc == 'comunicado' and a['tipo'] == 'institucion': key = 'comunicado-inst'
        txt = rng.choice(PLANTILLAS.get(key) or PLANTILLAS['publicar'])
        return txt.format(hecho=rng.choice(self.hechos), entidad=self.query, tag=''.join(w.capitalize() for w in self.query.split())[:24])

    def _post(self, a, acc, txt, r, plataforma, rng=None):
        resp = self._resp.pop(a['id'], None) if a else None
        if resp and not any(p['id'] == resp for p in self.feed): resp = None   # el LLM citó un id inexistente
        if a and not resp and acc == 'responder' and self.feed:
            cands = [p for p in self.feed[-10:] if p.get('agente') and p['agente'] != a['id']]
            resp = rng.choice(cands)['id'] if cands and rng else None
        st = self.estado
        post = {'id': f'p{len(self.feed) + 1}', 'ronda': r, 'agente': a['id'] if a else None,
                'nombre': a['nombre'] if a else 'Evento', 'rol': a['rol'] if a else '', 'tipo': a['tipo'] if a else 'evento',
                'plataforma': plataforma, 'accion': acc, 'texto': txt, 'responde_a': resp,
                'postura': a['postura'] if a else 0,
                'interacciones': int((a['influencia'] if a else 1) * (st.get('atencion', 20) + 10) * (rng.uniform(.6, 1.4) if rng else 1))}
        self.feed.append(post)
        return post

    @staticmethod
    def _snap(st):
        return {'ronda': st['ronda'], 'atencion': round(st['atencion'], 1), 'presion': round(st['presion'], 1),
                'sentimiento': round(st['sentimiento'], 3), 'indagacion': st['indagacion']}

    # ── FASE 4a: ensemble Monte Carlo (solo reglas) ─────────────────────
    def correr_ensemble(self, n=40):
        cuenta = {'indagacion': 0, 'escalamiento': 0, 'contencion': 0, 'debate': 0}
        finales = []
        base_ag = [dict(a, memoria=[]) for a in self.agentes]
        for k in range(n):
            rng = random.Random(_semilla(self.query) + 7919 * (k + 1))
            ag = copy.deepcopy(base_ag)
            for a in ag: a['postura'] = a['postura0']
            st = self.estado_inicial(len(self.hechos), len(self.noticias))
            pico = st['atencion']
            for r in range(1, self.rondas + 1):
                for ev in ([self.eventos[r]] if r in self.eventos else []): self.aplicar_evento(st, ev)
                plan = [(a, self.elegir_accion(a, st, rng)) for a in ag]
                plan = [(a, acc) for a, acc in plan if acc]
                for a, acc in plan: self.aplicar(st, a, acc, rng)
                self.cierre_ronda(st, ag, plan)
                pico = max(pico, st['atencion'])
            cuenta['indagacion'] += st['indagacion']; cuenta['debate'] += st['debate']
            cuenta['escalamiento'] += pico >= 60
            cuenta['contencion'] += st['atencion'] < 30 and not st['indagacion']
            finales.append(st)
        pct = lambda x: round(100 * x / n)
        self.ensemble = {
            'corridas': n,
            'desenlaces': [
                {'id': 'indagacion', 'evento': 'Un ente de control abre indagación', 'probabilidad': pct(cuenta['indagacion'])},
                {'id': 'escalamiento', 'evento': 'El caso escala a agenda mediática nacional (atención ≥ 60)', 'probabilidad': pct(cuenta['escalamiento'])},
                {'id': 'debate', 'evento': 'Citación a debate de control político', 'probabilidad': pct(cuenta['debate'])},
                {'id': 'contencion', 'evento': 'El caso se apaga sin indagación (atención final < 30)', 'probabilidad': pct(cuenta['contencion'])},
            ],
            'promedios': {k: round(sum(f[k] for f in finales) / n, 1) for k in ('atencion', 'presion', 'sentimiento')},
        }

    # ── FASE 4b: ReportAgent ReACT con herramientas ─────────────────────
    def herramientas(self):
        return {
            'metricas': (lambda **_: {'final': self.timeline[-1], 'inicio': self.timeline[0], 'hitos': self.hitos}),
            'ensemble': (lambda **_: self.ensemble),
            'posts_destacados': (lambda n=8, **_: [{k: p[k] for k in ('id', 'ronda', 'nombre', 'plataforma', 'accion', 'texto', 'interacciones')}
                                                  for p in sorted(self.feed, key=lambda p: -p['interacciones'])[:int(n)]]),
            'posturas': (lambda **_: [{'id': a['id'], 'nombre': a['nombre'], 'rol': a['rol'], 'inicial': a['postura0'], 'final': a['postura']}
                                      for a in self.agentes]),
            'buscar': (lambda termino='', **_: [{'id': p['id'], 'nombre': p['nombre'], 'texto': p['texto']}
                                                for p in self.feed if termino.lower() in p['texto'].lower()][:10]),
            'entrevistar': (lambda agente='', pregunta='', **_: self.chat(agente, pregunta)),
        }

    def generar_informe(self, progress, max_pasos=8):
        tools = self.herramientas()
        if LLMRouter.enabled():
            try:
                self.informe = self._informe_react(tools, progress, max_pasos)
                return
            except Exception as e:
                log.warning('informe ReACT: %s', e)
        self.informe = {'texto': self._informe_reglas(), 'pasos': [], 'modo': 'reglas'}

    def _informe_react(self, tools, progress, max_pasos):
        sistema = ('Eres el ReportAgent de RADAR. Analizas una SIMULACIÓN social (agentes ficticios) sobre un caso de control público. '
                   'Herramientas: metricas(), ensemble(), posts_destacados(n), posturas(), buscar(termino), entrevistar(agente, pregunta). '
                   'En cada paso responde SOLO JSON: {"pensamiento":"","herramienta":"nombre","args":{}} o, cuando tengas suficiente, '
                   '{"informe":"markdown"}. Las probabilidades deben salir de ensemble(); no inventes cifras ni hechos. '
                   'Deja claro que es un ejercicio prospectivo, no una conclusión jurídica.')
        obs, pasos = [], []
        for i in range(max_pasos):
            progress(i, max_pasos)
            hist = '\n'.join(f'Paso {k + 1}: {p["herramienta"]}({json.dumps(p["args"], ensure_ascii=False)}) → {p["obs"][:900]}'
                             for k, p in enumerate(pasos)) or '(ninguno)'
            prompt = (f'Escenario: {self.escenario}\nEntidad: {self.query}\nRondas: {self.rondas} · Agentes: {len(self.agentes)}\n'
                      f'Pasos previos:\n{hist}\n\nSiguiente paso (máx {max_pasos - i} restantes). '
                      'El informe final debe tener: Resumen, Dinámica de la simulación, Actores clave, Desenlaces probables (con %), '
                      'Señales tempranas a vigilar, Limitaciones.')
            d = LLMRouter.chat_json(prompt, sistema, max_tokens=2200)
            if d.get('informe'):
                return {'texto': d['informe'], 'pasos': [{k: p[k] for k in ('pensamiento', 'herramienta', 'args')} for p in pasos], 'modo': 'llm'}
            h = d.get('herramienta')
            if h not in tools:
                pasos.append({'pensamiento': d.get('pensamiento', ''), 'herramienta': str(h), 'args': {}, 'obs': 'Herramienta desconocida'})
                continue
            args = d.get('args') or {}
            try: o = tools[h](**args)
            except Exception as e: o = f'error: {e}'
            pasos.append({'pensamiento': d.get('pensamiento', ''), 'herramienta': h, 'args': args, 'obs': json.dumps(o, ensure_ascii=False, default=str)})
        texto = LLMRouter.chat('Redacta ya el informe final en markdown con lo observado:\n' +
                               '\n'.join(f'{p["herramienta"]}: {p["obs"][:900]}' for p in pasos), sistema.split('En cada paso')[0], max_tokens=2200)
        return {'texto': texto, 'pasos': [{k: p[k] for k in ('pensamiento', 'herramienta', 'args')} for p in pasos], 'modo': 'llm'}

    def _informe_reglas(self):
        f, i = self.timeline[-1], self.timeline[0]
        des = sorted(self.ensemble['desenlaces'], key=lambda d: -d['probabilidad'])
        top = sorted(self.feed, key=lambda p: -p['interacciones'])[:4]
        movs = sorted(self.agentes, key=lambda a: -abs(a['postura'] - a['postura0']))[:3]
        L = [f'# Informe de simulación — {self.query}', '',
             f'**Escenario:** {self.escenario}', '',
             '## Resumen',
             f'Se simularon {self.rondas} rondas con {len(self.agentes)} agentes ficticios. La atención pública pasó de '
             f'{i["atencion"]:.0f} a {f["atencion"]:.0f}/100 y la presión institucional de {i["presion"]:.0f} a {f["presion"]:.0f}/100. '
             + ('En la corrida narrada **un ente de control abrió indagación**.' if f['indagacion'] else 'En la corrida narrada no se abrió indagación.'), '',
             f'## Desenlaces probables ({self.ensemble["corridas"]} corridas)']
        L += [f'- **{d["probabilidad"]}%** — {d["evento"]}' for d in des]
        L += ['', '## Hitos de la corrida narrada']
        L += [f'- Ronda {h["ronda"]}: {h["texto"]}' for h in self.hitos] or ['- Sin hitos institucionales.']
        L += ['', '## Mensajes con más interacción']
        L += [f'- {p["nombre"]} (R{p["ronda"]}, {p["plataforma"]}): «{p["texto"][:160]}»' for p in top]
        L += ['', '## Actores que más cambiaron de postura']
        L += [f'- {a["nombre"]}: {a["postura0"]:+.2f} → {a["postura"]:+.2f}' for a in movs]
        L += ['', '## Señales tempranas a vigilar',
              '- Radicación de denuncias formales y derechos de petición.',
              '- Citaciones a debate de control político.',
              '- Comunicados de Procuraduría, Contraloría o Fiscalía.', '',
              '## Limitaciones',
              'Ejercicio prospectivo con agentes ficticios y reglas simplificadas. No es una predicción de hechos ni una conclusión jurídica.']
        return '\n'.join(L)

    # ── FASE 5: interacción ────────────────────────────────────────────
    def chat(self, agente_id, mensaje):
        mensaje = (mensaje or '').strip()[:800]
        if agente_id in ('report', '', None):
            if LLMRouter.enabled():
                try:
                    return LLMRouter.chat(f'Informe:\n{(self.informe or {}).get("texto", "")[:4000]}\nEnsemble: {json.dumps(self.ensemble, ensure_ascii=False)}\n'
                                          f'Pregunta: {mensaje}', 'Eres el ReportAgent de RADAR. Responde sobre la simulación sin inventar cifras.', max_tokens=700)
                except Exception as e:
                    log.warning('chat report: %s', e)
            des = max(self.ensemble['desenlaces'], key=lambda d: d['probabilidad'])
            return f'Según {self.ensemble["corridas"]} corridas, el desenlace más frecuente es «{des["evento"]}» ({des["probabilidad"]}%). ' \
                   f'Atención final {self.timeline[-1]["atencion"]:.0f}/100, presión {self.timeline[-1]["presion"]:.0f}/100.'
        a = next((x for x in self.agentes if x['id'] == agente_id), None)
        if not a: return 'Agente no encontrado.'
        if LLMRouter.enabled():
            try:
                return LLMRouter.chat(
                    f'Pregunta del investigador: {mensaje}',
                    f'Eres «{a["nombre"]}», {a["rol"]}, personaje FICTICIO de una simulación sobre {self.query}. Bio: {a["bio"]} '
                    f'Objetivo: {a.get("objetivo", "")}. Postura actual {a["postura"]:+.2f} (-1 defiende a la entidad, +1 la cuestiona). '
                    f'Tu memoria: {" | ".join(a["memoria"][-8:]) or "sin acciones"}. Hechos conocidos: {self.hechos[:6]}. '
                    'Responde en primera persona, breve, coherente con tu memoria. No inventes hechos nuevos.', temperature=0.7, max_tokens=500)
            except Exception as e:
                log.warning('chat agente: %s', e)
        ult = a['memoria'][-1] if a['memoria'] else 'no he participado todavía'
        lado = 'sigo cuestionando' if a['postura'] > 0.2 else 'sigo defendiendo' if a['postura'] < -0.2 else 'mantengo una posición neutral sobre'
        return f'Como {a["rol"].lower()}, {lado} la gestión de {self.query}. Lo último que hice: {ult}. (Respuesta por reglas: configure un LLM para diálogo libre.)'

    # ── vista para el frontend ─────────────────────────────────────────
    def vista(self, full=True):
        ags = [{**{k: a[k] for k in ('id', 'nombre', 'rol', 'tipo', 'postura', 'postura0', 'influencia', 'actividad', 'plataforma', 'bio')},
                'objetivo': a.get('objetivo', ''), 'acciones_n': len(a['memoria'])} for a in self.agentes]
        return {'sim_id': self.id, 'fase': self.fase, 'modo': self.modo, 'query': self.query, 'escenario': self.escenario,
                'rondas': self.rondas, 'ronda_actual': self.estado.get('ronda', 0) if self.estado else 0,
                'hechos': self.hechos, 'noticias': self.noticias, 'grafo': self.grafo, 'agentes': ags,
                'feed': self.feed if full else self.feed[-80:], 'timeline': self.timeline, 'hitos': self.hitos,
                'ensemble': self.ensemble, 'informe': self.informe}


class SimulationEngine:
    def run_async(self, query, escenario, rondas, agentes, semilla, eventos, ctx):
        sim_id = uuid.uuid4().hex[:12]
        escenario = (escenario or '').strip() or f'¿Cómo reaccionarán la opinión pública y los entes de control si se difunden los hallazgos de RADAR sobre {query}?'
        sim = Simulation(sim_id, query, escenario[:600], rondas, agentes, semilla, eventos, ctx)
        if len(SIMS) >= _MAX_SIMS: SIMS.pop(next(iter(SIMS)))
        SIMS[sim_id] = sim
        tid = tm.create_task('simulation', {'query': query, 'sim_id': sim_id})
        threading.Thread(target=self._run, args=(tid, sim), daemon=True).start()
        return tid, sim_id

    def _run(self, tid, sim):
        up = lambda p, m: tm.update_task(tid, progress=p, message=m, result=sim.vista(full=False))
        try:
            tm.update_task(tid, status=TaskStatus.PROCESSING, progress=3, message='Fase 1/5 · Construyendo grafo semilla...')
            sim.fase = 'grafo'; sim.construir_grafo(); up(12, f'Grafo semilla: {len(sim.grafo["nodes"])} nodos · {len(sim.hechos)} hechos')
            sim.fase = 'agentes'; up(14, 'Fase 2/5 · Generando agentes...')
            sim.generar_agentes(random.Random(_semilla(sim.query)))
            up(22, f'{len(sim.agentes)} agentes con memoria y postura propia')
            sim.fase = 'simulacion'
            sim.simular(lambda r: up(22 + int(56 * r / sim.rondas), f'Fase 3/5 · Ronda {r}/{sim.rondas}'))
            sim.fase = 'prediccion'; up(80, 'Fase 4/5 · Ensemble de 40 corridas...')
            sim.correr_ensemble(40)
            up(84, 'Fase 4/5 · ReportAgent analizando la simulación...')
            sim.generar_informe(lambda i, n: up(84 + int(14 * i / n), f'Fase 4/5 · ReportAgent paso {i + 1}/{n}'))
            sim.fase = 'interaccion'
            tm.update_task(tid, status=TaskStatus.COMPLETED, progress=100, message='Fase 5/5 · Lista para interacción', result=sim.vista())
        except Exception as e:
            log.exception('simulación')
            tm.update_task(tid, status=TaskStatus.FAILED, error=str(e), result=sim.vista(full=False))
