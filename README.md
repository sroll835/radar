# RADAR v6 — Sistema de Inteligencia Anticorrupción Colombia

Motor de análisis anticorrupción que cruza **6 fuentes de datos públicas** de Colombia
en tiempo real y calcula un **Score de Corrupción multidimensional**.

---

## Arquitectura

```
radar/
├── backend/                     ← API Flask (Python)
│   ├── app/
│   │   ├── __init__.py          ← App factory + todas las rutas REST
│   │   ├── config.py            ← Variables de entorno y parámetros
│   │   ├── models/
│   │   │   └── task.py          ← TaskManager: jobs async con polling
│   │   ├── services/
│   │   │   ├── agents.py        ← 6 agentes paralelos (patrón MiroFish)
│   │   │   ├── graph_service.py ← GraphRAG: nodos y aristas Cytoscape
│   │   │   ├── riesgo.py        ← Motor de alertas: 7 detectores
│   │   │   └── report_agent.py  ← ReportAgent ReACT con Claude
│   │   └── utils/
│   │       ├── llm_client.py    ← Cliente Anthropic unificado
│   │       └── logger.py        ← Logger centralizado
│   ├── run.py                   ← Punto de entrada
│   └── requirements.txt
├── frontend/                    ← App web (HTML + CSS + JS modular)
│   ├── index.html               ← Shell HTML — carga todos los módulos
│   ├── css/
│   │   └── radar.css            ← Estilos completos (dark theme)
│   └── js/
│       ├── state.js             ← Store global S, nav, constantes
│       ├── api.js               ← HTTP client + polling + buscarTodo
│       ├── search.js            ← buildWhere + fetchContratos/Proc/...
│       ├── render.js            ← AI summary, mapa, timeline, alertas
│       ├── score.js             ← Motor score 6 dimensiones
│       ├── graph.js             ← Cytoscape.js + interacciones
│       ├── sheets.js            ← Paneles de detalle (tap en tarjeta)
│       ├── export.js            ← Exportar PDF/CSV + toast
│       └── utils.js             ← Demo data + inicialización
├── .env.example
└── README.md
```

---

## Fuentes de datos (6 APIs públicas Colombia)

Única fuente de verdad: `backend/app/sources.py` (datasets, columnas, campos de búsqueda y normalización).
Los frontends no consultan datos.gov.co: todo pasa por el backend.

| Agente | Dataset | Nombre en datos.gov.co | Búsqueda por nombre | Búsqueda por ID |
|---|---|---|---|---|
| SECOP II | jbjy-vk9h | SECOP II - Contratos Electrónicos | nombre_entidad (+alias), proveedor_adjudicado | documento_proveedor (NIT con o sin DV) |
| Procuraduría SIRI | iaeu-rcn6 | Antecedentes de SIRI | entidad_sancionado (+alias), nombres+apellidos | numero_identificacion |
| Contraloría | n2rx-k8hk | Procesos de Responsabilidad Fiscal | entidad_afectada (+alias) | no aplica (no publica implicados) |
| SIIF Nación | bpij-5vy9 | Ejecución PGN detallada por rubro | nombreentidad, nombresector (+alias) | no aplica |
| SIGEP / DAFP | 2jzx-383z | Conjunto servidores públicos | nombreentidad (+alias) | no aplica (sin nombre ni cédula) |
| RUES / Confecámaras | c82u-588k | Personas Naturales, Jurídicas y ESAL | razon_social, sigla (sin alias) | nit, numero_identificacion |

Reglas: solo nombre → coincidencia parcial sin mayúsculas ni tildes (vocales → comodín `_` en palabras de 5+ letras);
solo ID → igualdad exacta; nombre + ID → AND; sin resultados → vacío (nunca datos de demostración).
Alias de entidades (`ALIAS_ENTIDADES`): PRESIDENCIA → DAPRE, solo en campos de entidad («DAPRE» coincide por accidente en RUES).

Cada búsqueda devuelve `fuentes: {<fuente>: {estado: ok|vacia|error|no_aplica, registros, mensaje, dataset}}`;
timeout 20 s, 2 reintentos con espera creciente y una fuente caída no tumba las demás. Tests: `cd backend && venv\Scripts\python -m pytest`.

---

## Endpoints API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servidor y disponibilidad LLM |
| POST | `/api/search` | Inicia búsqueda paralela → retorna `task_id` |
| GET | `/api/search/status/:id` | Polling del estado (progress 0-100) |
| POST | `/api/report` | Genera informe con ReportAgent → `report_task_id` |
| GET | `/api/report/status/:id` | Polling del informe |
| GET | `/api/graph/:id` | Grafo Cytoscape del resultado |
| GET | `/api/alerts/:id` | Alertas detectadas |
| GET | `/api/agents/status` | Lista de agentes disponibles |

---

## Instalación

### Backend

```bash
cd backend

# Crear entorno virtual (recomendado)
python -m venv venv
source venv/bin/activate      # Linux/Mac
venv\Scripts\activate         # Windows

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp ../.env.example ../.env
# Editar .env y añadir ANTHROPIC_API_KEY

# Arrancar servidor
python run.py
# → http://localhost:5001
```

### Frontend

```bash
# Opción A: abrir directamente
open frontend/index.html

# Opción B: servidor local (evita restricciones CORS)
cd frontend
python -m http.server 3000
# → http://localhost:3000
```

El frontend detecta automáticamente si el backend está disponible.
Si no lo está, cae al **modo demo** con datos de ejemplo.

---

## Lógica de búsqueda

### Regla AND / OR automática

| Campos ingresados | Comportamiento |
|---|---|
| Solo nombre | Busca el nombre en todos los campos de texto |
| Solo cédula/NIT | Búsqueda exacta por identificación |
| Nombre + cédula | **AND**: ambos deben coincidir (más preciso) |
| Ninguno | Rechaza con aviso — no muestra demo |

**Si no hay resultados → pantalla vacía. Nunca se mezclan datos reales con demo.**

---

## Índice de señales de riesgo (antes «Score de Corrupción»)

Cuenta señales en datos abiertos que ameritan verificación, con reglas propias de RADAR.
**No mide corrupción** ni afirma que una persona o entidad haya cometido una falta o un delito.

| Dimensión | Peso | Fuente |
|---|---|---|
| Contratación Pública | 40% | SECOP II (solo contratos de la entidad buscada) |
| Control Disciplinario | 25% | Procuraduría SIRI (vigentes o últimos 5 años) |
| Responsabilidad Fiscal | 22% | Contraloría |
| Ejecución Presupuestal | 10% | SIIF Nación |
| Anomalías de Nómina | 3% | SIGEP / DAFP |

Escala: **0** (sin señales) → **100** (muchas señales para verificar)
Niveles de señales: Mínimo (<15) · Bajo (<35) · Moderado (<55) · Alto (<75) · Muy alto (≥75)

Se eliminó la dimensión «Conflicto de Interés RUES × SECOP»: estar inscrito en el RUES y contratar con el
Estado es lo normal para un proveedor y no indica conflicto de interés.

### Calidad del dato (Ley 1581/2012 art. 4)
- **Homónimos:** si una búsqueda por nombre coincide con varias personas o empresas distintas (distinta cédula/NIT),
  esos registros se separan (`homonimos` en la respuesta), se muestran aparte con advertencia y no entran en alertas,
  índice, grafo ni informes. Solo la búsqueda con cédula o NIT es precisa.
- **Sanciones SIRI:** solo se muestran las vigentes o con efectos en los últimos 5 años.
- **Contratista buscado:** la contratación directa y la concentración en un proveedor solo se evalúan sobre contratos
  de la entidad buscada, no sobre los de un contratista.

---

## ReportAgent (patrón ReACT de MiroFish)

1. **Plan**: el LLM diseña el índice del informe
2. **Secciones**: genera cada sección con contexto completo de las 6 fuentes
3. **Reflexión**: añade conclusiones y próximos pasos
4. **Chat**: responde preguntas sobre los datos en modo conversacional

Requiere `ANTHROPIC_API_KEY` configurada en `.env`.
Sin la clave, el frontend usa resúmenes locales como fallback.

---

## Notas legales

Los datos de sanciones disciplinarias (Procuraduría) y procesos de responsabilidad
fiscal (Contraloría) son procedimientos administrativos. **No implican condena penal.**
Uso recomendado: investigación periodística, control social ciudadano y academia.

La pestaña **📜 Legal y privacidad** (`web/src/pages/Legal.jsx`) contiene los Términos de uso y la Política de
tratamiento de datos, y la app pide aceptarlos en la primera visita. Antes de publicar, configura en `web/.env`
los datos del responsable del tratamiento: `VITE_RESPONSABLE_NOMBRE`, `VITE_RESPONSABLE_ID`,
`VITE_RESPONSABLE_DIRECCION`, `VITE_RESPONSABLE_EMAIL` y `VITE_RESPONSABLE_TELEFONO`.

Los proveedores de IA externos (Claude, OpenAI, Gemini, DeepSeek) quedan desactivados salvo `LLM_PERMITIR_EXTERNOS=true`,
porque enviarles nombres de personas es una transferencia internacional de datos (Ley 1581/2012 art. 26).

---
## v7 — Módulo Inteligencia (7 agentes integrados)
Agentes: Geopolítico, Económico, Legislativo, Electoral, Seguridad, Corrupción, Contratación Pública.
Cada uno devuelve resumen, análisis, predicciones, fuentes y nivel de confianza; el orquestador los corre en paralelo y genera un resumen ejecutivo.

**Endpoints:** `GET /api/intelligence/agents` · `POST /api/intelligence/run {query, task_id?}` · `GET /api/intelligence/status/<id>` · `GET|POST /api/llm`
**Multi-LLM:** claude, openai, gemini, deepseek, llama (Ollama/Groq). Claves en `.env`; se cambia desde el selector de la pestaña 🧠 Intel.
**Evidencia:** titulares de Google News RSS + resultados de la última búsqueda RADAR (agentes Corrupción y Contratación). Sin LLM analiza por reglas; sin evidencia lo dice y baja la confianza (no inventa datos).

## Manual rápido
1. `cd backend && pip install -r requirements.txt && cp ../.env.example ../.env && python run.py`
2. `cd frontend && python -m http.server 8080` → http://localhost:8080
3. Busca por nombre y/o cédula/NIT (si no existe, no muestra nada). Revisa SECOP, Grafo, RUES, SIIF, Nómina, Procuraduría y Score.
4. Pestaña 🧠 Intel → ▶ ANALIZAR (usa la búsqueda actual como contexto).

## v8 — Simulación de enjambre (flujo MiroFish)
Pestaña 🔮 **Simul.** del frontend `web/` + `backend/app/services/simulation.py`.
1. **Grafo semilla:** resultados de la búsqueda + titulares de prensa + texto que aporte el usuario (el LLM extrae entidades y relaciones).
2. **Agentes:** ecosistema ficticio (prensa, veedurías, entes de control disciplinario y fiscal simulados, oposición, oficialismo, vocería de la entidad, contratista simulado, ciudadanos) con postura, influencia y memoria. No se usa el nombre real de ningún proveedor ni se simulan imputaciones penales.
3. **Simulación:** N rondas en dos plataformas (red social y prensa/foro); métricas de atención, presión institucional y sentimiento; eventos programados o inyectados en vivo.
4. **Predicción:** 40 corridas del modelo de reglas → frecuencia de cada desenlace; ReportAgent ReACT (herramientas: metricas, ensemble, posts_destacados, posturas, buscar, entrevistar) redacta el informe.
5. **Interacción:** chat con el ReportAgent o con cualquier agente.

**Endpoints:** `POST /api/simulation/run {task_id, query, escenario, semilla, rondas, agentes, eventos[]}` · `GET /api/simulation/status/<id>` (devuelve resultados parciales) · `POST /api/simulation/<sim_id>/inject {texto}` · `POST /api/simulation/<sim_id>/chat {agente, mensaje}`.
Sin LLM funciona con plantillas y reglas. Con LLM cuesta ~1 llamada por ronda + ~10 de preparación e informe.

## v7 Enterprise (Sprint 1 del chat)
- **UI:** `frontend/enterprise.html` — menú de 11 secciones, Command Center, mapa por departamento con capas, panel «Director IA», tema oscuro/claro, Ctrl+K, responsive.
- **Seguridad:** login JWT (`/api/auth/login`), roles admin/analista, rate limiting. Actívalo con `REQUIRE_AUTH=true` y `ADMIN_PASSWORD` en `.env`.
- **Docker:** `docker compose up --build` (backend+frontend); `--profile data` añade PostGIS, Redis, Neo4j y Elasticsearch (aún sin conectar al código).
- **Pendiente (fases siguientes):** Next.js/Tailwind, ingesta de documentos (RAG), grafo en Neo4j, OAuth/MFA, alertas multicanal.
