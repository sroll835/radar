"""RADAR v6 — Config"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'), override=True)

class Config:
    SECRET_KEY        = os.environ.get('SECRET_KEY', 'radar-secret-2025')
    DEBUG             = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    JSON_AS_ASCII     = False
    ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
    LLM_MODEL         = os.environ.get('LLM_MODEL', 'claude-sonnet-4-20250514')
    LLM_MAX_TOKENS    = int(os.environ.get('LLM_MAX_TOKENS', '2048'))
    REPORT_TEMPERATURE= float(os.environ.get('REPORT_TEMPERATURE', '0.5'))
    MAX_TOOL_CALLS    = int(os.environ.get('MAX_TOOL_CALLS', '8'))
    # APIs Colombia: datasets, campos y filtros viven en app/sources.py (única fuente de verdad)
    # Umbrales motor riesgo
    RIESGO_DIRECTA_PCT = 40
    RIESGO_VALOR_ALTO  = 5_000_000_000
    RIESGO_PROVEEDOR_N = 3
    RIESGO_SOBREEJ_PCT = 105
    RIESGO_SUBEJECUCION= 30
    # Decreto 611/2025
    ESCALA_SALARIAL = {
        'Directivo':   {24:28_000_000,22:21_000_000,18:17_600_000,14:13_200_000,10:9_600_000},
        'Asesor':      {18:15_000_000,14:13_200_000,12:11_800_000,10:9_600_000,6:5_700_000},
        'Profesional': {18:10_200_000,14:8_100_000,10:5_900_000,6:3_800_000,1:2_100_000},
        'Técnico':     {14:3_700_000,10:2_900_000,6:2_210_000,1:1_550_000},
        'Asistencial': {14:2_660_000,10:2_030_000,6:1_540_000,1:1_160_000},
    }
    @classmethod
    def validate(cls):
        from app.utils.llm_router import LLMRouter
        errs = []
        if not LLMRouter.enabled():
            errs.append(f'Proveedor LLM «{LLMRouter.active()}» ({LLMRouter.model()}) no disponible — '
                        'se usarán resúmenes por reglas. Para Ollama: ollama serve && ollama pull gemma4:e2b')
        return errs
