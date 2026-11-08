import os, sys, json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


class FakeResp:
    def __init__(self, status=200, body=None):
        self.status_code = status
        self._body = body if body is not None else []
        self.headers = {'content-type': 'application/json'}
        self.text = json.dumps(self._body)

    def json(self):
        if isinstance(self._body, Exception): raise self._body
        return self._body


class FakeHTTP:
    """Simula requests.get: `rutas` mapea un fragmento de URL → FakeResp o excepción (o lista de ellas en orden)."""
    def __init__(self, rutas, meta=None):
        self.rutas, self.meta, self.llamadas = rutas, meta, []

    def get(self, url, params=None, timeout=None, headers=None):
        self.llamadas.append((url, params))
        if '/api/views/' in url:
            if self.meta is None: return FakeResp(500, {})
            return FakeResp(200, {'columns': [{'fieldName': c} for c in self.meta.get(url.rsplit('/', 1)[-1][:-5], [])]})
        for frag, resp in self.rutas.items():
            if frag in url:
                r = resp.pop(0) if isinstance(resp, list) else resp
                if isinstance(r, Exception): raise r
                return r
        return FakeResp(200, [])
