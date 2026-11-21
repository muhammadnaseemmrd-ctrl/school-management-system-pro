import React, { useEffect, useState } from 'react';
import { Bell, Check, PenLine, ShieldCheck } from 'lucide-react';
import { useReducedMotion } from './useMotion';
import { TONES } from './AiRobot';

/* The three animated "screens" for the AI roadmap. Each one takes `step` (0 to 5) and shows how far the workflow has got.
   Everything here is an illustration with sample data; it is not a recording of a working feature. */

const PANEL = { background: 'linear-gradient(160deg,#101a33,#0b1226)', border: '1px solid rgba(160,180,255,0.16)' };
const MONO = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };

// letters appearing one after another, like typing
function useTyped(text, restart) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced || !restart) { setN(text.length); return undefined; }
    setN(0); let i = 0;
    const id = setInterval(() => { i += 2; setN(Math.min(text.length, i)); if (i >= text.length) clearInterval(id); }, 28);
    return () => clearInterval(id);
  }, [text, restart, reduced]);
  return text.slice(0, n);
}

/* ───────── 1. A term paper from the chapters the teacher has taught ───────── */
const ASK = 'Class 12, Star Edition. I have taught chapters 1 to 3. Please make the first-term paper.';
const SECTIONS = [
  { k: 'A', t: 'Multiple choice', m: '10 × 1', tag: 'Ch 1', lines: [88, 72, 80] },
  { k: 'B', t: 'Short answers', m: '5 × 4', tag: 'Ch 2', lines: [92, 66] },
  { k: 'C', t: 'Long answers', m: '2 × 10', tag: 'Ch 3', lines: [84, 58] },
];
export function PaperPreview({ step }) {
  const typed = useTyped(ASK, step === 0);
  const taught = ['Ch 1', 'Ch 2', 'Ch 3', 'Ch 4'];
  return (
    <div className="grid gap-4 rounded-2xl p-4 md:grid-cols-[0.9fr_1.1fr]" style={PANEL} aria-hidden="true" data-no-i18n>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl p-3" style={{ background: 'rgba(79,216,234,0.08)', border: '1px solid rgba(79,216,234,0.35)' }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: TONES.live.main }}>Teacher</p>
          <p className="mt-1 min-h-[3.6rem] text-[13px] leading-5" style={{ color: '#e8eeff' }}>{typed}<span className="ai-caret" style={{ color: TONES.live.main }}>▍</span></p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9db0d6' }}>Chapters taught</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {taught.map((c, i) => {
              const on = i < 3 && step >= 1;
              return <span key={c} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: on ? 'rgba(169,155,255,0.22)' : 'rgba(255,255,255,0.05)', color: on ? '#c9c1ff' : '#8497bd', border: `1px solid ${on ? 'rgba(169,155,255,0.6)' : 'rgba(160,180,255,0.18)'}`, transition: `all 400ms ${i * 220}ms` }}>{on ? '✓ ' : ''}{c}</span>;
            })}
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: step >= 4 && step < 5 ? 'rgba(255,201,94,0.14)' : 'rgba(255,255,255,0.04)', color: step >= 4 && step < 5 ? TONES.review.main : '#9db0d6', border: `1px solid ${step >= 4 && step < 5 ? 'rgba(255,201,94,0.5)' : 'rgba(160,180,255,0.14)'}`, transition: 'all 400ms' }}>
          <PenLine className="h-4 w-4" /> {step >= 5 ? 'Teacher approved every question' : step >= 4 ? 'Waiting for the teacher to review' : 'The teacher always has the last word'}
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-[420px] rounded-md bg-white p-4 text-[#1b2837] shadow-2xl" style={{ opacity: step >= 2 ? 1 : 0.25, transform: step >= 2 ? 'none' : 'translateY(10px) rotate(-1deg)', transition: 'opacity 500ms, transform 600ms cubic-bezier(.2,.9,.3,1)' }}>
        <div className="text-center"><p className="text-[11px] font-bold tracking-[0.2em]">FIRST TERM EXAMINATION</p><p className="text-[10px] text-[#4f5f70]">Class 12 · Star Edition · Chapters 1 to 3 · 50 marks</p></div>
        <div className="mt-3 space-y-3">
          {SECTIONS.map((s, si) => (
            <div key={s.k} style={{ opacity: step >= 3 ? 1 : 0, transform: step >= 3 ? 'none' : 'translateX(-10px)', transition: `all 500ms ${si * 320}ms` }}>
              <div className="flex items-center justify-between text-[10px] font-bold"><span>Section {s.k} · {s.t}</span><span className="text-[#4f5f70]">{s.m}</span></div>
              {s.lines.map((w, li) => {
                const flagged = step === 4 && s.k === 'B' && li === 1;
                return (
                  <div key={li} className="mt-1.5 flex items-center gap-2 rounded px-1 py-0.5" style={{ background: flagged ? '#fff3d1' : 'transparent', outline: flagged ? '1.5px solid #e8a800' : 'none', transition: 'background 300ms' }}>
                    <span className="w-3 text-[9px] text-[#4f5f70]">{li + 1}.</span>
                    <i className="block h-1.5 rounded" style={{ width: step >= 3 ? `${w}%` : '10%', background: '#cdd6df', transition: `width 700ms ${si * 320 + li * 140}ms` }} />
                    <span className="flex-shrink-0 whitespace-nowrap rounded px-1 text-[8px] font-bold" style={{ background: '#ece9ff', color: '#4a3fb3' }}>{s.tag}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t pt-2 text-[10px] font-bold" style={{ borderColor: '#e3e7e7' }}><span>17 questions</span><span>Total 50 marks ✓</span></div>
        <div className="absolute end-3 top-3 rotate-[-9deg] rounded border-2 px-2 py-0.5 text-[11px] font-extrabold tracking-widest" style={{ borderColor: '#14744f', color: '#14744f', opacity: step >= 5 ? 1 : 0, transform: `rotate(-9deg) scale(${step >= 5 ? 1 : 1.8})`, transition: 'all 380ms cubic-bezier(.3,1.4,.5,1)' }}>APPROVED</div>
      </div>
    </div>
  );
}

/* ───────── 2. Cameras that watch for an accident and tell the right people ───────── */
const Person = ({ x, fall, hot, scan, shade = '#6f84c9' }) => (
  <g transform={`translate(${x} 0)`}>
    <g style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', transform: fall ? 'rotate(82deg) translateX(4px)' : 'none', transition: 'transform 520ms cubic-bezier(.5,0,.8,1.2)' }}>
      <circle cx="0" cy="48" r="4.2" fill="#d8e0ff" /><rect x="-4.6" y="53" width="9.2" height="15" rx="4" fill={shade} />
      <rect x="-5" y="68" width="3.6" height="9" rx="1.6" fill="#3d4a7a" /><rect x="1.4" y="68" width="3.6" height="9" rx="1.6" fill="#3d4a7a" />
    </g>
    <rect x="-10" y={fall ? 60 : 40} width="20" height={fall ? 20 : 41} rx="2" fill="none" strokeWidth="1.3" strokeDasharray={hot ? '0' : '3 2'} style={{ stroke: hot ? TONES.alert.main : TONES.live.main, opacity: scan ? 1 : 0, transition: 'opacity 400ms, stroke 300ms' }} />
  </g>
);
function Tile({ uid, label, people, step, fallIdx, aiText }) {
  const hasFall = fallIdx != null; const fell = hasFall && step >= 2; const scan = step >= 1;
  return (
    <div className="relative overflow-hidden rounded-xl" style={{ border: `1px solid ${fell ? 'rgba(255,127,115,0.8)' : 'rgba(160,180,255,0.2)'}`, boxShadow: fell ? '0 0 0 3px rgba(255,127,115,0.18), 0 0 26px rgba(255,127,115,0.35)' : 'none', transition: 'all 400ms' }}>
      <svg viewBox="0 0 160 90" className="block w-full" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id={`fl-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#18284a" /><stop offset="1" stopColor="#0c1530" /></linearGradient>
          <linearGradient id={`sc-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4fd8ea" stopOpacity="0" /><stop offset="1" stopColor="#4fd8ea" stopOpacity="0.55" /></linearGradient></defs>
        <rect width="160" height="90" fill={`url(#fl-${uid})`} />
        <polygon points="0,62 160,62 160,90 0,90" fill="#0f1a38" /><line x1="0" y1="62" x2="160" y2="62" stroke="#24345f" strokeWidth="1" />
        {[18, 66, 114].map((dx) => <rect key={dx} x={dx} y="70" width="28" height="3" rx="1" fill="#2b3c6b" />)}
        {people.map((p, i) => <Person key={i} x={p} fall={fell && i === fallIdx} hot={fell && i === fallIdx} scan={scan} shade={i % 2 ? '#6f84c9' : '#8c78d6'} />)}
        {scan && <rect className="ai-scan" x="0" y="0" width="160" height="10" fill={`url(#sc-${uid})`} />}
      </svg>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-2 py-1 text-[9px] font-bold" style={{ ...MONO, color: '#d5def7', background: 'linear-gradient(180deg,rgba(5,9,20,0.75),transparent)' }}>
        <span>{label}</span><span className="inline-flex items-center gap-1"><i className="ai-blinkdot block h-1.5 w-1.5 rounded-full" style={{ background: '#ff5b5b' }} />LIVE</span>
      </div>
      <div className="absolute bottom-1.5 start-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ ...MONO, background: fell ? 'rgba(255,127,115,0.22)' : 'rgba(79,216,234,0.16)', color: fell ? '#ffb1a9' : '#7ee6f3', border: `1px solid ${fell ? 'rgba(255,127,115,0.6)' : 'rgba(79,216,234,0.4)'}`, transition: 'all 300ms' }}>{fell ? 'Possible fall · review' : scan ? aiText : 'Connecting…'}</div>
    </div>
  );
}
export function CctvPreview({ step }) {
  return (
    <div className="relative rounded-2xl p-3" style={PANEL} aria-hidden="true" data-no-i18n>
      <div className="grid grid-cols-2 gap-3">
        <Tile uid="t0" label="Class 9-B · Cam 3" people={[26, 62, 100, 134]} fallIdx={2} step={step} aiText="Normal · 4 people" />
        <Tile uid="t1" label="Corridor · Cam 1" people={[40, 112]} step={step} aiText="Normal · 2 people" />
        <Tile uid="t2" label="Lab 2 · Cam 4" people={[30, 78, 124]} step={step} aiText="Normal · 3 people" />
        <Tile uid="t3" label="Playground · Cam 2" people={[20, 52, 92, 128]} step={step} aiText="Normal · 4 people" />
      </div>
      <div className="pointer-events-none absolute inset-x-6 bottom-5 flex justify-center" style={{ opacity: step >= 3 ? 1 : 0, transform: step >= 3 ? 'none' : 'translateY(14px)', transition: 'all 500ms cubic-bezier(.2,.9,.3,1)' }}>
        <div className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-bold shadow-2xl" style={step >= 5 ? { background: '#0f2b22', color: '#7df0bd', border: '1px solid rgba(73,224,160,0.6)' } : { background: '#2b1216', color: '#ffb1a9', border: '1px solid rgba(255,127,115,0.7)' }}>
          {step >= 5 ? <><ShieldCheck className="h-4 w-4" /> A person reviewed the clip and closed the alert</> : <><Bell className="h-4 w-4 ai-ring" /> Alert sent to the principal and the nurse</>}
        </div>
      </div>
    </div>
  );
}

/* ───────── 3. Attendance from a camera at the classroom door ───────── */
const KIDS = [
  { n: 'Ayesha', x: 30 }, { n: 'Bilal', x: 70 }, { n: 'Hira', x: 110 }, { n: 'Usman', x: 150 }, { n: 'Hamza', x: 187 },
];
const REG = [
  { n: 'Ayesha Khan', s: 'P' }, { n: 'Bilal Ahmed', s: 'P' }, { n: 'Hira Noor', s: '?' }, { n: 'Usman Tariq', s: 'P' }, { n: 'Zainab Ali', s: 'A' }, { n: 'Hamza Raza', s: 'P' },
];
export function FacePreview({ step }) {
  const present = REG.filter((r, i) => (r.s === 'P' && step >= 2) || (r.n === 'Hira Noor' && step >= 4)).length;
  return (
    <div className="grid gap-4 rounded-2xl p-3 md:grid-cols-[1.25fr_0.75fr]" style={PANEL} aria-hidden="true" data-no-i18n>
      <div className="relative overflow-hidden rounded-xl" style={{ border: '1px solid rgba(160,180,255,0.2)' }}>
        <svg viewBox="0 0 210 118" className="block w-full">
          <defs><linearGradient id="dr-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a2a4f" /><stop offset="1" stopColor="#0c1530" /></linearGradient>
            <linearGradient id="dr-scan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4fd8ea" stopOpacity="0" /><stop offset="1" stopColor="#4fd8ea" stopOpacity="0.5" /></linearGradient></defs>
          <rect width="210" height="118" fill="url(#dr-bg)" />
          <rect x="6" y="8" width="198" height="104" rx="4" fill="none" stroke="#24345f" strokeWidth="2" />
          {KIDS.map((k, i) => {
            const unsure = i === 2; const matched = step >= 2 && (!unsure || step >= 4); const looking = step >= 1;
            const col = matched ? TONES.done.main : unsure && step >= 2 ? TONES.review.main : TONES.live.main;
            return (
              <g key={k.n} style={{ transform: step >= 1 ? 'translateX(0)' : 'translateX(-60px)', opacity: step >= 1 ? 1 : 0, transition: `all 700ms cubic-bezier(.2,.9,.3,1) ${i * 260}ms` }}>
                <circle cx={k.x} cy="60" r="11" fill="#d8e0ff" /><path d={`M${k.x - 19} 112 Q${k.x - 19} 78 ${k.x} 78 Q${k.x + 19} 78 ${k.x + 19} 112 Z`} fill={i % 2 ? '#6f84c9' : '#8c78d6'} />
                {looking && <path d={`M${k.x - 15} ${46} h6 M${k.x - 15} ${46} v6 M${k.x + 15} ${46} h-6 M${k.x + 15} ${46} v6 M${k.x - 15} ${74} h6 M${k.x - 15} ${74} v-6 M${k.x + 15} ${74} h-6 M${k.x + 15} ${74} v-6`} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" style={{ transition: 'stroke 300ms' }} />}
                {step >= 2 && <text x={k.x} y="40" textAnchor="middle" fontSize="6" fontWeight="700" fill={col} style={{ ...MONO, transition: 'fill 300ms' }}>{unsure && step < 4 ? 'Not sure' : k.n}</text>}
              </g>
            );
          })}
          {step >= 1 && step < 5 && <rect className="ai-sweep" x="0" y="8" width="26" height="104" fill="url(#dr-scan)" />}
        </svg>
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-2 py-1 text-[9px] font-bold" style={{ ...MONO, color: '#d5def7', background: 'linear-gradient(180deg,rgba(5,9,20,0.75),transparent)' }}><span>Class 7-A · Door camera</span><span className="inline-flex items-center gap-1"><i className="ai-blinkdot block h-1.5 w-1.5 rounded-full" style={{ background: '#ff5b5b' }} />8:02</span></div>
      </div>
      <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(160,180,255,0.16)' }}>
        <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9db0d6' }}>Register</p><p className="text-[12px] font-bold tabular-nums" style={{ color: '#e8eeff' }}>{present} of 6 present</p></div>
        <ul className="mt-2 space-y-1.5">
          {REG.map((r, i) => {
            const st = r.s === 'P' ? (step >= 2 ? 'P' : '-') : r.n === 'Hira Noor' ? (step >= 4 ? 'P' : step >= 2 ? '?' : '-') : (step >= 5 ? 'A' : '-');
            const map = { P: ['Present', TONES.done.main, 'rgba(73,224,160,0.14)'], '?': ['Confirm?', TONES.review.main, 'rgba(255,201,94,0.16)'], A: ['Absent', '#ff9f95', 'rgba(255,127,115,0.14)'], '-': ['Waiting', '#8497bd', 'rgba(255,255,255,0.05)'] }[st];
            return (
              <li key={r.n} className="flex items-center justify-between rounded-lg px-2 py-1 text-[12px]" style={{ background: 'rgba(255,255,255,0.03)', color: '#e8eeff' }}>
                <span>{r.n}</span>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: map[1], background: map[2], transition: `all 350ms ${i * 90}ms` }}>{map[0]}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: step >= 5 ? TONES.done.main : '#9db0d6', transition: 'color 300ms' }}><Check className="h-3.5 w-3.5" /> {step >= 5 ? 'Teacher signed off the register' : 'The teacher signs off the register'}</p>
      </div>
    </div>
  );
}
