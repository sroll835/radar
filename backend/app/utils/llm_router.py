"""RADAR v7 — AI Router multi-proveedor (Ollama local, Claude, GPT, Gemini, DeepSeek, Llama).
Solo usa `requests`; las claves se leen de variables de entorno (.env).
Proveedor por defecto: Ollama local con gemma4:e2b (LLM_PROVIDER / OLLAMA_MODEL / OLLAMA_HOST para cambiarlo)."""
import os, json, re, time, requests

PROVIDERS = {
    # Ollama local (API nativa /api/chat): sin clave; disponible si el servidor responde
    'ollama':   {'env': '', 'model_env': 'OLLAMA_MODEL', 'model': 'gemma4:e2b', 'keyless': True},
    'claude':   {'env': 'ANTHROPIC_API_KEY', 'model_env': 'CLAUDE_MODEL',   'model': 'claude-sonnet-4-20250514'},
    'openai':   {'env': 'OPENAI_API_KEY',    'model_env': 'OPENAI_MODEL',   'model': 'gpt-4o-mini',
                 'url': 'https://api.openai.com/v1/chat/completions'},
    'gemini':   {'env': 'GEMINI_API_KEY',    'model_env': 'GEMINI_MODEL',   'model': 'gemini-1.5-flash'},
    'deepseek': {'env': 'DEEPSEEK_API_KEY',  'model_env': 'DEEPSEEK_MODEL', 'model': 'deepseek-chat',
                 'url': 'https://api.deepseek.com/v1/chat/completions'},
    # Llama vía endpoint compatible OpenAI (Ollama local, Groq, Together...)
    'llama':    {'env': 'LLAMA_API_KEY',     'model_env': 'LLAMA_MODEL',    'model': 'llama3.1',
                 'url_env': 'LLAMA_BASE_URL', 'url': 'http://localhost:11434/v1/chat/completions', 'keyless': True},
}

# Proveedores que procesan los datos fuera del servidor (normalmente en el extranjero). Enviarles nombres de
# personas es una transferencia internacional de datos personales (Ley 1581/2012 art. 26; Circular Externa SIC 002
# de 2024 sobre IA): quedan desactivados salvo que el responsable lo autorice expresamente con
# LLM_PERMITIR_EXTERNOS=true, después de declararlo en la Política de tratamiento de datos.
EXTERNOS = {'claude', 'openai', 'gemini', 'deepseek'}


def externos_permitidos() -> bool:
    return os.environ.get('LLM_PERMITIR_EXTERNOS', 'false').strip().lower() in ('1', 'true', 'si', 'sí', 'yes')


def es_externo(name: str) -> bool:
    if name in EXTERNOS: return True
    if name == 'llama':   # endpoint compatible OpenAI: externo salvo que apunte a esta misma máquina
        url = os.environ.get('LLAMA_BASE_URL', '') or PROVIDERS['llama']['url']
        return not re.match(r'https?://(localhost|127\.0\.0\.1|\[::1\])(:|/|$)', url)
    return False


def _ollama_host():
    return os.environ.get('OLLAMA_HOST', 'http://localhost:11434').rstrip('/')

_ollama_ok = {'t': 0, 'ok': False}

def _ollama_up():
    """¿Responde el servidor Ollama? (cacheado 15 s para no consultarlo en cada petición)"""
    if time.time() - _ollama_ok['t'] > 15:
        try: _ollama_ok['ok'] = requests.get(_ollama_host() + '/api/tags', timeout=1.5).ok
        except Exception: _ollama_ok['ok'] = False
        _ollama_ok['t'] = time.time()
    return _ollama_ok['ok']


class LLMRouter:
    _active = os.environ.get('LLM_PROVIDER', 'ollama')

    @classmethod
    def available(cls):
        out = {}
        for k, p in PROVIDERS.items():
            if k == 'ollama': out[k] = _ollama_up()
            elif es_externo(k) and not externos_permitidos(): out[k] = False
            else: out[k] = bool(os.environ.get(p['env'])) or bool(p.get('keyless') and os.environ.get('LLAMA_BASE_URL'))
        return out

    @classmethod
    def model(cls, provider=None):
        p = PROVIDERS[provider or cls._active]
        return os.environ.get(p['model_env'], p['model'])

    @classmethod
    def set_provider(cls, name):
        if name not in PROVIDERS: raise ValueError('Proveedor desconocido: ' + name)
        if es_externo(name) and not externos_permitidos():
            raise ValueError(f'El proveedor «{name}» procesa datos fuera del servidor y está desactivado '
                             '(transferencia internacional de datos, Ley 1581/2012 art. 26). Actívelo con LLM_PERMITIR_EXTERNOS=true.')
        cls._active = name

    @classmethod
    def active(cls): return cls._active

    @classmethod
    def enabled(cls, provider=None):
        return cls.available().get(provider or cls._active, False)

    @classmethod
    def chat(cls, prompt, system='', provider=None, temperature=0.3, max_tokens=1800, json_mode=False):
        name = provider or cls._active
        if es_externo(name) and not externos_permitidos():
            raise ValueError(f'Proveedor externo «{name}» desactivado (LLM_PERMITIR_EXTERNOS no está habilitado)')
        p = PROVIDERS[name]
        key = os.environ.get(p['env'], '') if p['env'] else ''
        model = os.environ.get(p['model_env'], p['model'])
        if name == 'ollama':
            body = {'model': model, 'stream': False, 'think': False,
                    'messages': ([{'role': 'system', 'content': system}] if system else []) + [{'role': 'user', 'content': prompt}],
                    'options': {'temperature': temperature, 'num_predict': max_tokens,
                                'num_ctx': int(os.environ.get('OLLAMA_NUM_CTX', '8192'))}}
            if json_mode: body['format'] = 'json'
            r = requests.post(_ollama_host() + '/api/chat', json=body, timeout=int(os.environ.get('OLLAMA_TIMEOUT', '600')))
            r.raise_for_status()
            return r.json()['message']['content'].strip()
        if name != 'llama' and not key:
            raise ValueError(f'{p["env"]} no configurada')
        if name == 'claude':
            r = requests.post('https://api.anthropic.com/v1/messages', timeout=90,
                headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
                json={'model': model, 'max_tokens': max_tokens, 'temperature': temperature,
                      'system': system, 'messages': [{'role': 'user', 'content': prompt}]})
            r.raise_for_status()
            return r.json()['content'][0]['text'].strip()
        if name == 'gemini':
            r = requests.post(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                params={'key': key}, timeout=90,
                json={'systemInstruction': {'parts': [{'text': system}]},
                      'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
                      'generationConfig': {'temperature': temperature, 'maxOutputTokens': max_tokens}})
            r.raise_for_status()
            return r.json()['candidates'][0]['content']['parts'][0]['text'].strip()
        url = os.environ.get(p.get('url_env', ''), '') or p['url']
        if name == 'llama' and url.rstrip('/').endswith('/v1'): url += '/chat/completions'
        headers = {'content-type': 'application/json'}
        if key: headers['authorization'] = 'Bearer ' + key
        r = requests.post(url, headers=headers, timeout=90, json={
            'model': model, 'temperature': temperature, 'max_tokens': max_tokens,
            'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}]})
        r.raise_for_status()
        return r.json()['choices'][0]['message']['content'].strip()

    @classmethod
    def chat_json(cls, prompt, system='', **kw):
        txt = cls.chat(prompt, system, json_mode=True, **kw)
        txt = re.sub(r'^```(?:json)?\s*', '', txt.strip(), flags=re.I)
        txt = re.sub(r'\s*```$', '', txt)
        m = re.search(r'\{.*\}', txt, re.S)
        return json.loads(m.group(0) if m else txt)
