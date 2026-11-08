"""RADAR — LLM Client: interfaz por mensajes que delega en LLMRouter
(así el ReportAgent usa el mismo proveedor que el resto: Ollama gemma4:e2b por defecto)."""
import json, re
from typing import List, Dict
from app.utils.llm_router import LLMRouter

DEFAULT_SYSTEM = 'Eres RADAR, asistente anticorrupción Colombia.'


def _prompt(messages: List[Dict]) -> str:
    if len(messages) == 1: return messages[0]['content']
    return '\n\n'.join(f'{m["role"].upper()}: {m["content"]}' for m in messages)


class LLMClient:
    def chat(self, messages: List[Dict], system='', temperature=0.7, max_tokens=2048) -> str:
        if not LLMRouter.enabled(): raise ValueError(f'Proveedor LLM «{LLMRouter.active()}» no disponible')
        return LLMRouter.chat(_prompt(messages), system or DEFAULT_SYSTEM, temperature=temperature, max_tokens=max_tokens)

    def chat_json(self, messages, system='', temperature=0.3, max_tokens=2048) -> Dict:
        if not LLMRouter.enabled(): raise ValueError(f'Proveedor LLM «{LLMRouter.active()}» no disponible')
        resp = LLMRouter.chat(_prompt(messages), system or DEFAULT_SYSTEM, temperature=temperature, max_tokens=max_tokens, json_mode=True)
        cleaned = re.sub(r'^```(?:json)?\s*\n?', '', resp.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r'\n?```\s*$', '', cleaned).strip()
        try: return json.loads(cleaned)
        except ValueError: raise ValueError(f'LLM retornó JSON inválido: {cleaned[:200]}')
