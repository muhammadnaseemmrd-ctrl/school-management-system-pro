import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, btnPrimary, btnGhost } from '../ui';
import apiClient from '../../utils/apiClient';
import { call } from './earlyKit';

// Original picture-word set (same as the server's). Nothing here counts, times or compares children.
const SET = [['🍎', 'apple', 'سیب'], ['🍌', 'banana', 'کیلا'], ['🐱', 'cat', 'بلی'], ['🐶', 'dog', 'کتا'], ['🐟', 'fish', 'مچھلی'], ['🌞', 'sun', 'سورج'], ['🌙', 'moon', 'چاند'], ['⭐', 'star', 'ستارہ'], ['🚗', 'car', 'گاڑی'], ['📖', 'book', 'کتاب'], ['🏠', 'house', 'گھر'], ['🌳', 'tree', 'درخت'], ['🥛', 'milk', 'دودھ'], ['🍞', 'bread', 'روٹی'], ['🐓', 'hen', 'مرغی'], ['🎈', 'balloon', 'غبارہ']];
const say = (text, lang) => { try { if (!('speechSynthesis' in window)) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'ur' ? 'ur-PK' : 'en-GB'; u.rate = 0.8; window.speechSynthesis.speak(u); } catch (e) { /* no voice on this device: the word is still on screen */ } };
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

function Matching({ lang }) {
  const [round, setRound] = useState(0); const [said, setSaid] = useState(''); const [gentle, setGentle] = useState('');
  const q = useMemo(() => { const order = shuffle(SET); const target = order[0]; return { target, options: shuffle(order.slice(0, 3)) }; }, [round]);
  const idx = lang === 'ur' ? 2 : 1;
  useEffect(() => { setSaid(''); setGentle(''); }, [round]);
  const pick = (o) => { if (o === q.target) { setSaid(`${o[0]} ${o[idx]}`); say(o[idx], lang); } else { setGentle('Have another look.'); say(q.target[idx], lang); } };
  return (
    <div className="grid justify-items-center gap-4 text-center">
      <p className="text-sm text-[#5b6b7b]">Listen, then tap the picture that matches.</p>
      <button className="text-8xl" aria-label={`Hear the word`} onClick={() => say(q.target[idx], lang)}>🔊</button>
      <div className="flex flex-wrap justify-center gap-4">{q.options.map((o) => <button key={o[1]} onClick={() => pick(o)} className="rounded-3xl border-2 border-[#e3e7e7] bg-white p-4 text-7xl hover:border-[#2a5cac]" aria-label={lang === 'ur' ? o[2] : o[1]}>{o[0]}</button>)}</div>
      <div role="status" aria-live="polite" className="min-h-[2.5rem] text-2xl font-bold text-[#215a52]" dir={lang === 'ur' ? 'rtl' : 'ltr'}>{said ? `Yes! ${said}` : <span className="text-[#5b6b7b]">{gentle}</span>}</div>
      <button className={btnPrimary} onClick={() => setRound(round + 1)}>{said ? 'Next picture' : 'Another picture'}</button>
    </div>
  );
}

function Tracing() {
  const [glyph, setGlyph] = useState('A'); const cv = useRef(null); const drawing = useRef(false); const [done, setDone] = useState(false);
  const paintGuide = () => { const c = cv.current; if (!c) return; const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.font = 'bold 260px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.setLineDash([6, 10]); x.lineWidth = 3; x.strokeStyle = '#9aa7b8'; x.strokeText(glyph, c.width / 2, c.height / 2 + 10); x.setLineDash([]); };
  useEffect(() => { paintGuide(); setDone(false); }, [glyph]);
  const pos = (e) => { const r = cv.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.current.width / r.width), y: (e.clientY - r.top) * (cv.current.height / r.height) }; };
  const down = (e) => { drawing.current = true; const x = cv.current.getContext('2d'); const p = pos(e); x.beginPath(); x.moveTo(p.x, p.y); x.lineWidth = 14; x.lineCap = 'round'; x.strokeStyle = '#2a5cac'; cv.current.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drawing.current) return; const x = cv.current.getContext('2d'); const p = pos(e); x.lineTo(p.x, p.y); x.stroke(); };
  const up = () => { drawing.current = false; };
  return (
    <div className="grid justify-items-center gap-3 text-center">
      <p className="text-sm text-[#5b6b7b]">Follow the dotted letter with your finger.</p>
      <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Letter">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').slice(0, 36).map((g) => <button key={g} role="radio" aria-checked={glyph === g} onClick={() => setGlyph(g)} className={`h-9 w-9 rounded-lg border text-sm font-bold ${glyph === g ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white'}`}>{g}</button>)}</div>
      <canvas ref={cv} width={420} height={380} aria-label={`Tracing the letter ${glyph}`} className="w-full max-w-[420px] touch-none rounded-2xl border-2 border-[#e3e7e7]" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      <div className="flex gap-2"><button className={btnGhost} onClick={() => { paintGuide(); setDone(false); }}>Start again</button><button className={btnPrimary} onClick={() => { setDone(true); say(glyph, 'en'); }}>All done</button></div>
      <div role="status" aria-live="polite" className="min-h-[2rem] text-xl font-bold text-[#215a52]">{done ? `Lovely tracing of ${glyph}!` : ''}</div>
    </div>
  );
}

// Practice with a child. Words only: after a go, the teacher can note what they saw. Nothing is scored.
export default function PlayArea({ childId, childName }) {
  const [mode, setMode] = useState('matching'); const [lang, setLang] = useState('en'); const [effort, setEffort] = useState('Following'); const [note, setNote] = useState('');
  const record = () => call(() => apiClient.post('/early/practice', { childId, kind: mode === 'matching' ? 'matching' : 'tracing', effort, note }), 'Noted', () => setNote(''));
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2"><div role="tablist" aria-label="Practice" className="flex gap-2">{[['matching', 'Match the picture'], ['tracing', 'Trace a letter']].map(([k, v]) => <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === k ? 'bg-[#2a5cac] text-white' : 'border border-[#e3e7e7] bg-white'}`}>{v}</button>)}</div>
        {mode === 'matching' && <select className="rounded-lg border border-[#e3e7e7] px-2 py-2 text-sm" aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)}><option value="en">English</option><option value="ur">اردو</option></select>}</div>
      {mode === 'matching' ? <Matching lang={lang} /> : <Tracing />}
      {childId && <div className="mt-5 grid gap-2 border-t border-[#e3e7e7] pt-3"><div className="text-sm font-semibold">What did you see {childName ? `with ${childName}` : ''}?</div>
        <div role="radiogroup" aria-label="Effort" className="flex gap-1.5">{['Exploring', 'Following', 'Steady'].map((k) => <button key={k} role="radio" aria-checked={effort === k} onClick={() => setEffort(k)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${effort === k ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#e3e7e7] bg-white'}`}>{k}</button>)}</div>
        <div className="flex gap-2"><input className="w-full rounded-lg border border-[#e3e7e7] px-3 py-2 text-sm" aria-label="Words about what you saw" placeholder="In a few words" value={note} onChange={(e) => setNote(e.target.value)} /><button className={btnGhost} onClick={record}>Save note</button></div></div>}
    </Card>
  );
}
