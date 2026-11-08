/* Componentes base — usan las mismas clases de radar.css */
import React from 'react';

export const Empty = ({ icon, title, sub }) => (
  <div className="empty"><div className="ei">{icon}</div><div className="et">{title}</div><div className="es">{sub}</div></div>
);

export const Loading = ({ text }) => (
  <div className="ls" style={{ display: 'flex' }}><div className="sp" /><div className="lt">{text}</div></div>
);

export const PageHeader = ({ title, sub, count }) => (
  <div className="ph">
    <div className="pt">{title}</div>
    {sub && <div className="ps">{sub}</div>}
    {count ? <div className="prc">{count}</div> : null}
  </div>
);

/** cls: tr | ty | tg | tb | '' */
export const Tag = ({ cls = '', children, style }) => (
  <span className={`tag ${cls}`} style={style}><span className="td2" />{children}</span>
);

export const riskCls = r => (r === 'ALTO' ? 'tr' : r === 'MEDIO' ? 'ty' : 'tg');
export const pctCls = p => (p > 90 ? 'tr' : p > 60 ? 'ty' : 'tg');

/** color: blue | red | yellow */
export const Card = ({ color = 'blue', icon, title, sub, children, onClick, delay = 0 }) => {
  const ci = { blue: 'ci-b', red: 'ci-r', yellow: 'ci-y' }[color];
  return (
    <div className={`card card-${color}`} style={{ animationDelay: `${delay}s` }} onClick={onClick}>
      <div className={`cii ${ci}`}>{icon}</div>
      <div className="cb2">
        <div className="cn">{title}</div>
        {sub && <div className="cd">{sub}</div>}
        {children && <div className="ct">{children}</div>}
      </div>
      <div className="chev">›</div>
    </div>
  );
};

export const SubTabs = ({ tabs, value, onChange }) => (
  <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
    {tabs.map(([id, label]) => (
      <button key={id} className={`gcbtn${value === id ? ' on' : ''}`} style={{ borderRadius: 0, borderBottom: 'none', borderTop: 'none', borderLeft: 'none' }}
        onClick={() => onChange(id)}>{label}</button>
    ))}
  </div>
);

export const NomAlert = ({ icon, title, desc, meta, warn, delay = 0 }) => (
  <div className={`nom-alert${warn ? ' warn' : ''}`} style={{ animationDelay: `${delay}s` }}>
    <div className="nom-icon">{icon}</div>
    <div className="nom-title">{title}</div>
    <div className="nom-desc">{desc}</div>
    {meta && <div className="nom-meta">{meta}</div>}
  </div>
);

export const Bar = ({ pct, color, height = 8, style }) => (
  <div style={{ height, background: 'var(--border2)', borderRadius: height / 2, overflow: 'hidden', ...style }}>
    <div style={{ height: '100%', width: `${Math.max(0, Math.min(pct, 100))}%`, background: color, borderRadius: height / 2, transition: 'width .8s ease' }} />
  </div>
);

export const MONO = { fontFamily: "'Space Mono',monospace" };
export const Lbl = ({ children, style }) => (
  <div style={{ ...MONO, fontSize: '.46rem', color: 'var(--muted2)', letterSpacing: 1, marginBottom: 3, ...style }}>{children}</div>
);
