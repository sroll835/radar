"""RADAR v6 — Flask App Factory"""
from flask import Flask, jsonify, request
from flask_cors import CORS
from app.config import Config
from app.utils.logger import setup_logger

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    app.json.ensure_ascii = False
    CORS(app, resources={r'/api/*': {'origins': '*'}})
    log = setup_logger('radar')
    from app import auth; auth.register(app)
    for w in Config.validate(): log.warning(w)

    from app.models.task import TaskManager, TaskStatus
    from app.services.agents import SearchOrchestrator
    from app.services.report_agent import ReportAgent
    from app.services.intelligence import IntelligenceOrchestrator, AGENTS as INTEL_AGENTS
    from app.utils.llm_router import LLMRouter
    intel = IntelligenceOrchestrator()
    tm = TaskManager(); orch = SearchOrchestrator(); ra = ReportAgent()

    @app.get('/api/health')
    def health():
        return jsonify({'status':'ok','version':'8.0','llm':LLMRouter.enabled(),'provider':LLMRouter.active(),'model':LLMRouter.model()})

    @app.post('/api/search')
    def search():
        body  = request.get_json(force=True) or {}
        query = (body.get('query') or '').strip()
        ced   = (body.get('cedula') or '').strip()
        if not query and not ced:
            return jsonify({'success':False,'error':'query o cedula requerido'}), 400
        task_id = orch.search_async(query or ced, ced)
        return jsonify({'success':True,'task_id':task_id})

    @app.get('/api/search/status/<task_id>')
    def search_status(task_id):
        task = tm.get_task(task_id)
        if not task: return jsonify({'success':False,'error':'task no encontrada'}), 404
        return jsonify({'success':True, **task.to_dict()})

    @app.post('/api/report')
    def report():
        body    = request.get_json(force=True) or {}
        task_id = body.get('task_id','')
        mode    = body.get('mode','summary')
        message = body.get('message','')
        search_task = tm.get_task(task_id)
        if not search_task or search_task.status != TaskStatus.COMPLETED:
            return jsonify({'success':False,'error':'Búsqueda no completada'}), 400
        data     = search_task.result or {}
        busqueda = search_task.metadata.get('query','')
        query    = message if mode=='chat' and message else busqueda
        rtid     = tm.create_task('report', {'query':query,'mode':mode})
        ra.generate_async(rtid, query, data.get('results',{}), data.get('alerts',[]), mode,
                          fuentes=data.get('fuentes'), busqueda=busqueda)
        return jsonify({'success':True,'report_task_id':rtid})

    @app.get('/api/report/status/<task_id>')
    def report_status(task_id):
        task = tm.get_task(task_id)
        if not task: return jsonify({'success':False,'error':'task no encontrada'}), 404
        return jsonify({'success':True, **task.to_dict()})

    @app.get('/api/graph/<task_id>')
    def graph(task_id):
        task = tm.get_task(task_id)
        if not task or task.status != TaskStatus.COMPLETED:
            return jsonify({'success':False,'error':'Búsqueda no completada'}), 400
        return jsonify({'success':True,'graph':(task.result or {}).get('graph',{})})

    @app.get('/api/alerts/<task_id>')
    def alerts(task_id):
        task = tm.get_task(task_id)
        if not task or task.status != TaskStatus.COMPLETED:
            return jsonify({'success':False,'error':'Búsqueda no completada'}), 400
        a = (task.result or {}).get('alerts',[])
        return jsonify({'success':True,'alerts':a,'count':len(a),
                        'critical':sum(1 for x in a if x['severity']=='ALTO')})

    @app.get('/api/agents/status')
    def agents_status():
        from app.services.agents import AGENTS
        return jsonify({'success':True,'agents':[{'name':A().name,'source':A().source} for A in AGENTS]})

    @app.get('/api/intelligence/agents')
    def intel_agents():
        return jsonify({'success':True,'agents':[{'id':A.id,'name':A.name,'icon':A.icon} for A in INTEL_AGENTS]})

    @app.post('/api/intelligence/run')
    def intel_run():
        body = request.get_json(force=True) or {}
        query = (body.get('query') or '').strip()
        ctx = {}
        st = tm.get_task(body.get('task_id',''))
        if st and st.status == TaskStatus.COMPLETED: ctx = st.result or {}
        return jsonify({'success':True,'task_id':intel.run_async(query, ctx)})

    @app.get('/api/intelligence/status/<task_id>')
    def intel_status(task_id):
        task = tm.get_task(task_id)
        if not task: return jsonify({'success':False,'error':'task no encontrada'}), 404
        return jsonify({'success':True, **task.to_dict()})

    # ── Simulación de enjambre (flujo MiroFish) ─────────────────────
    from app.services.simulation import SimulationEngine, SIMS
    sim_engine = SimulationEngine()

    @app.post('/api/simulation/run')
    def sim_run():
        body = request.get_json(force=True) or {}
        ctx, query = {}, (body.get('query') or '').strip()
        st = tm.get_task(body.get('task_id', ''))
        if st and st.status == TaskStatus.COMPLETED:
            ctx = st.result or {}
            query = query or st.metadata.get('query', '')
        if not query and not (body.get('semilla') or '').strip():
            return jsonify({'success': False, 'error': 'Realice una búsqueda o aporte un texto semilla'}), 400
        eventos = []
        for e in body.get('eventos') or []:
            try: eventos.append({'ronda': int(e.get('ronda')), 'texto': str(e.get('texto', ''))[:300]})
            except (TypeError, ValueError): pass
        tid, sim_id = sim_engine.run_async(query or 'el caso', body.get('escenario', ''), body.get('rondas', 12),
                                           body.get('agentes', 14), body.get('semilla', ''), eventos, ctx)
        return jsonify({'success': True, 'task_id': tid, 'sim_id': sim_id})

    @app.get('/api/simulation/status/<task_id>')
    def sim_status(task_id):
        task = tm.get_task(task_id)
        if not task: return jsonify({'success': False, 'error': 'task no encontrada'}), 404
        return jsonify({'success': True, **task.to_dict()})

    @app.post('/api/simulation/<sim_id>/inject')
    def sim_inject(sim_id):
        sim = SIMS.get(sim_id)
        texto = ((request.get_json(force=True) or {}).get('texto') or '').strip()[:300]
        if not sim: return jsonify({'success': False, 'error': 'Simulación no encontrada'}), 404
        if not texto: return jsonify({'success': False, 'error': 'Texto vacío'}), 400
        if sim.fase != 'simulacion': return jsonify({'success': False, 'error': 'La simulación ya no está en curso'}), 409
        with sim.lock: sim.pendientes.append(texto)
        return jsonify({'success': True})

    @app.post('/api/simulation/<sim_id>/chat')
    def sim_chat(sim_id):
        sim = SIMS.get(sim_id)
        if not sim or not sim.ensemble: return jsonify({'success': False, 'error': 'Simulación no disponible'}), 404
        b = request.get_json(force=True) or {}
        return jsonify({'success': True, 'text': sim.chat(b.get('agente', 'report'), b.get('mensaje', ''))})

    @app.get('/api/llm')
    def llm_get():
        return jsonify({'success':True,'active':LLMRouter.active(),'model':LLMRouter.model(),'available':LLMRouter.available()})

    @app.post('/api/llm')
    def llm_set():
        try: LLMRouter.set_provider((request.get_json(force=True) or {}).get('provider',''))
        except ValueError as e: return jsonify({'success':False,'error':str(e)}), 400
        return jsonify({'success':True,'active':LLMRouter.active(),'available':LLMRouter.available()})

    @app.errorhandler(404)
    def not_found(e): return jsonify({'success':False,'error':'Endpoint no encontrado'}), 404
    @app.errorhandler(500)
    def internal(e): return jsonify({'success':False,'error':str(e)}), 500

    return app
