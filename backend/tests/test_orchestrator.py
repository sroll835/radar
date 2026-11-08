"""Estados por fuente: un 404 en una fuente no tumba las demás y queda como «error»."""
from conftest import FakeHTTP, FakeResp
from app import sources
from app.models.task import TaskManager, TaskStatus
from app.services import agents


def test_un_404_no_tumba_las_demas(monkeypatch):
    http = FakeHTTP({
        'n2rx-k8hk': FakeResp(404, {'code': 'dataset.missing', 'message': 'Not found'}),          # Contraloría falla
        'jbjy-vk9h': FakeResp(200, [{'nombre_entidad': 'DAPRE', 'proveedor_adjudicado': 'BORVILL SAS',
                                     'documento_proveedor': '8000586714', 'tipodocproveedor': 'NIT',
                                     'valor_del_contrato': '100', 'modalidad_de_contratacion': 'Licitación'}]),
    })
    real = sources.consultar
    monkeypatch.setattr(agents, 'consultar', lambda f, q, c: real(f, q, c, http=http, sleep=lambda s: None))
    orch = agents.SearchOrchestrator()
    tid = TaskManager().create_task('search', {'query': 'Presidencia'})
    orch._worker(tid, 'Presidencia', '')
    t = TaskManager().get_task(tid)
    assert t.status == TaskStatus.COMPLETED
    f = t.result['fuentes']
    assert set(f) == {a.name for a in agents.AGENTS}
    assert f['Contraloría']['estado'] == 'error' and '404' in f['Contraloría']['mensaje']
    assert f['SECOP II']['estado'] == 'ok' and f['SECOP II']['registros'] == 1
    assert f['SIIF Nación']['estado'] == 'vacia'
    assert t.result['results']['SECOP II'][0]['nombre_del_proveedor'] == 'BORVILL SAS'
    assert t.result['errors'] == {'Contraloría': f['Contraloría']['mensaje']}


def test_solo_id_marca_no_aplica_en_sigep(monkeypatch):
    http = FakeHTTP({})
    real = sources.consultar
    monkeypatch.setattr(agents, 'consultar', lambda f, q, c: real(f, q, c, http=http, sleep=lambda s: None))
    tid = TaskManager().create_task('search', {})
    agents.SearchOrchestrator()._worker(tid, '900170781', '900170781')       # la API pasa la cédula también como query
    f = TaskManager().get_task(tid).result['fuentes']
    assert f['SIGEP / DAFP']['estado'] == 'no_aplica' and 'sin identificación en este dataset' in f['SIGEP / DAFP']['mensaje']
    assert f['RUES / Confecámaras']['estado'] == 'vacia'
    where_rues = [p['$where'] for u, p in http.llamadas if 'c82u-588k' in u and p][0]
    assert 'like' not in where_rues                                          # solo ID → igualdad exacta, sin nombre
