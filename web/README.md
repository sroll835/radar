# RADAR v7 — Frontend web en React

Reescritura en React (Vite) de `frontend/index.html`. Mismo aspecto (reutiliza `radar.css`),
mismas 10 pestañas y el mismo backend Flask.

## Arranque

```bash
cd web
npm install
npm run dev        # → http://localhost:3000
npm run build      # genera dist/ para producción
```

URL del backend: por defecto `http://localhost:5001/api`. Para cambiarla, cree `web/.env` con
`VITE_RADAR_API=https://mi-servidor/api` (o defina `window.RADAR_API` antes de cargar la app).

Si el backend no responde, la app consulta datos.gov.co directamente (sin IA) y lo indica en pantalla.

## Estructura

```
src/
  App.jsx           ← cabecera, búsqueda, KPIs, barra de pestañas
  store.jsx         ← estado global (equivalente a S + buscarTodo)
  radar.css         ← estilos originales
  lib/              ← api, datos.gov.co, lógica, score, grafo (Cytoscape), exportación
  components/       ← UI base, panel de detalle (sheet), detalles por registro
  pages/            ← IA, Intel, Listas (SECOP/Procur./RUES), Grafo, SIIF, Nómina, Más, Score
```
