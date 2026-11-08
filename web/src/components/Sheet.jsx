/* Panel inferior de detalle (.sov + .sheet de radar.css) */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const SheetCtx = createContext(null);
export const useSheet = () => useContext(SheetCtx);

export function SheetProvider({ children }) {
  const [content, setContent] = useState(null);
  const [open, setOpen] = useState(false);
  const show = useCallback(node => { setContent(node); requestAnimationFrame(() => setOpen(true)); }, []);
  const close = useCallback(() => setOpen(false), []);
  // Valor estable: el grafo depende de él y no debe reconstruirse al abrir el panel
  const api = useMemo(() => ({ open: show, close }), [show, close]);
  return (
    <SheetCtx.Provider value={api}>
      {children}
      <div className={`sov${open ? ' open' : ''}`} onClick={close} />
      <div className={`sheet${open ? ' open' : ''}`}>
        <div className="sh-handle" />
        <div className="sh-scroll">{content}</div>
      </div>
    </SheetCtx.Provider>
  );
}

export const ShGrid = ({ items }) => (
  <div className="sh-grid">
    {items.filter(Boolean).map(([label, value, color, full]) => (
      <div key={label} className="sh-item" style={full ? { gridColumn: '1/-1' } : undefined}>
        <label>{label}</label><div className="sv" style={color ? { color } : undefined}>{value || 'N/A'}</div>
      </div>
    ))}
  </div>
);

export const Flags = ({ flags }) => (flags.length ? (
  <div className="sh-sec"><div className="sh-st">⚠ FLAGS DE RIESGO</div>
    <div className="flags-box">{flags.map(f => <div key={f} className="flag-row"><span>→</span>{f}</div>)}</div>
  </div>
) : null);

export const CloseBtn = ({ onClick, label = '✕ Cerrar' }) => (
  <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border2)', color: 'var(--muted2)', fontFamily: "'Space Mono',monospace", fontSize: '.58rem', padding: 9, borderRadius: 7, cursor: 'pointer', width: '100%', marginTop: 12 }}>
    {label}
  </button>
);
