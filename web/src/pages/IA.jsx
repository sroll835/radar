import React, { useEffect, useRef, useState } from 'react';
import { useRadar } from '../store';
import { PageHeader } from '../components/ui';

/** Efecto máquina de escribir (typewriter de render.js) */
function useTypewriter(text) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (!text) { setOut(''); return; }
    let i = 0;
    const iv = setInterval(() => { i++; setOut(text.slice(0, i)); if (i >= text.length) clearInterval(iv); }, 16);
    return () => clearInterval(iv);
  }, [text]);
  return out;
}

export default function IA() {
  const { aiText, aiLoading, loading, chat, sendChat, backend } = useRadar();
  const modelo = backend.llm ? `${(backend.provider || '').toUpperCase()} ${(backend.model || '').toUpperCase()}`.trim() : 'SIN IA (REGLAS LOCALES)';
  const shown = useTypewriter(loading ? '' : aiText);
  const [msg, setMsg] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [chat]);
  const send = () => { sendChat(msg); setMsg(''); };

  return (
    <>
      <PageHeader title="Análisis IA" sub={`${modelo} · INTELIGENCIA ANTICORRUPCIÓN`} />
      <div className="aibox">
        {aiLoading && <div className="ai-th"><div className="sp" style={{ width: 14, height: 14, borderWidth: 1.5 }} /><span>Analizando...</span></div>}
        <div className="ai-text">{loading ? aiText : shown}</div>
      </div>
      <div className="ph" style={{ marginTop: 2 }}><div className="pt" style={{ fontSize: '.9rem' }}>Chat Investigativo</div><div className="ps">PREGUNTE SOBRE LOS DATOS</div></div>
      <div className="chat-area">
        {chat.map((b, i) => <div key={i} className={`cb ${b.me ? 'buser' : 'bai'}`}>{b.text}</div>)}
        <div ref={end} />
      </div>
      <div className="cir">
        <input className="ci2" type="text" placeholder="Pregúntame sobre los datos..." autoComplete="off"
          value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
        <button className="bsend" onClick={send}>➤</button>
      </div>
    </>
  );
}
