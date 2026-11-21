import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GraduationCap, MousePointer2 } from 'lucide-react';
import { SectionHead } from './ui';
import { useInView, useReducedMotion } from './useMotion';

/* "A school year, in motion". As the visitor scrolls, a small graduation-cap token travels along a path through six moments of the
   school year. Each stop lights up and plays a tiny animation. Everything shown is something the product really does; the numbers in
   the pictures are samples. On phones, short screens and for people who ask for less motion, the same six cards are shown as a plain grid. */

const HEADER = 64; // height of the sticky site header, in px
const CARD_W = 236;
const CARD_H = 212;
const XS = [0.11, 0.27, 0.43, 0.59, 0.75, 0.89]; // where each stop sits along the path (share of the width)

/* ───────── the six little pictures (all sized for a 60px-high panel) ───────── */
const Join = ({ on }) => (
  <div style={{ height: 60 }} className="flex flex-col justify-center gap-2.5">
    <div className="flex items-center gap-1.5">
      {['Enquiry', 'Accepted', 'Enrolled'].map((t, i) => (
        <React.Fragment key={t}>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: on ? '#2c776c' : '#e3e7e7', color: on ? '#fff' : '#4a5a6b', transition: `background 380ms ${i * 480}ms, color 380ms ${i * 480}ms` }}>{t}</span>
          {i < 2 && <span className="h-0.5 flex-1 rounded" style={{ background: on ? '#2c776c' : '#cbd5dd', transition: `background 380ms ${i * 480 + 240}ms` }} />}
        </React.Fragment>
      ))}
    </div>
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: '#2a5cac', transform: on ? 'scale(1)' : 'scale(0.55)', opacity: on ? 1 : 0.35, transition: 'transform 500ms cubic-bezier(.3,1.5,.5,1) 1000ms, opacity 400ms 1000ms' }}>A</span>
      <div className="flex-1 space-y-1">
        <i className="block h-1.5 rounded" style={{ width: on ? '78%' : '18%', background: '#c9d3df', transition: 'width 700ms 1100ms' }} />
        <i className="block h-1.5 rounded" style={{ width: on ? '52%' : '12%', background: '#dde4ea', transition: 'width 700ms 1250ms' }} />
      </div>
    </div>
  </div>
);

const Register = ({ on }) => {
  const absent = [4, 17, 30];
  return (
    <div style={{ height: 60 }} className="flex items-center">
      <div className="grid w-full gap-[5px]" style={{ gridTemplateColumns: 'repeat(14, 1fr)' }}>
        {Array.from({ length: 42 }).map((_, i) => (
          <i key={i} className="block aspect-square rounded-full" style={{ background: on ? (absent.includes(i) ? '#e0896f' : '#2c776c') : '#d6dde3', transform: on ? 'scale(1)' : 'scale(0.6)', transition: `background 300ms ${i * 28}ms, transform 300ms ${i * 28}ms` }} />
        ))}
      </div>
    </div>
  );
};

const Week = ({ on }) => {
  const cols = [[40, 28], [28, 20, 22], [46, 30], [24, 36, 18], [36, 32]];
  const tint = ['#2a5cac', '#2c776c', '#b86650', '#6b5aa6', '#2a5cac'];
  return (
    <div style={{ height: 60 }} className="flex items-end gap-2">
      {cols.map((c, ci) => (
        <div key={ci} className="flex flex-1 flex-col justify-end gap-1">
          {c.map((h, bi) => (
            <i key={bi} className="block rounded" style={{ height: on ? h * 0.78 : 3, background: tint[(ci + bi) % tint.length], opacity: on ? 0.9 : 0.25, transition: `height 520ms cubic-bezier(.2,.9,.3,1) ${ci * 140 + bi * 90}ms, opacity 400ms ${ci * 140}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
};

const Marks = ({ on }) => {
  const bars = [['Eng', 64], ['Urdu', 82], ['Math', 52], ['Sci', 90], ['Isl', 74]];
  return (
    <div style={{ height: 60 }} className="flex items-end gap-2">
      {bars.map(([l, v], i) => (
        <div key={l} className="flex flex-1 flex-col items-center justify-end gap-0.5">
          <i className="block w-full rounded-t" style={{ height: on ? v * 0.42 : 2, background: v > 80 ? '#2c776c' : '#2a5cac', transition: `height 700ms cubic-bezier(.2,.9,.3,1) ${i * 120}ms` }} />
          <span className="text-[9px] font-bold" style={{ color: '#5b6b7b' }}>{l}</span>
        </div>
      ))}
    </div>
  );
};

const Card = ({ on }) => {
  const C = 2 * Math.PI * 20;
  return (
    <div style={{ height: 60 }} className="flex items-center gap-3">
      <svg viewBox="0 0 50 50" width="52" height="52" aria-hidden="true">
        <circle cx="25" cy="25" r="20" fill="none" stroke="#dde4ea" strokeWidth="5" />
        <circle cx="25" cy="25" r="20" fill="none" stroke="#2c776c" strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={on ? C * 0.18 : C} transform="rotate(-90 25 25)" style={{ transition: 'stroke-dashoffset 1300ms cubic-bezier(.3,.8,.2,1) 200ms' }} />
        <text x="25" y="29" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1b2837">82%</text>
      </svg>
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#e1f1ec', color: '#1f5e53', transform: on ? 'scale(1)' : 'scale(0.5)', opacity: on ? 1 : 0, transition: 'all 450ms cubic-bezier(.3,1.5,.5,1) 1300ms' }}>✓ Verified</span>
        <i className="block h-1.5 w-24 rounded" style={{ background: '#c9d3df', opacity: on ? 1 : 0.4, transition: 'opacity 500ms 900ms' }} />
      </div>
    </div>
  );
};

const Fees = ({ on }) => (
  <div style={{ height: 60 }} className="flex flex-col justify-center gap-1.5">
    {[['Tuition', '✓ Paid'], ['Transport', '✓ Paid']].map(([a, b], i) => (
      <div key={a} className="flex items-center justify-between rounded-md px-2 py-1 text-[10px] font-bold" style={{ background: '#fff', border: '1px solid #e3e7e7', color: '#1b2837', transform: on ? 'none' : 'translateX(-14px)', opacity: on ? 1 : 0, transition: `all 450ms ${i * 350}ms` }}>
        <span>{a}</span><span style={{ color: '#1f5e53' }}>{b}</span>
      </div>
    ))}
    <div className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#2a5cac', color: '#fff', transform: on ? 'scale(1)' : 'scale(0.6)', opacity: on ? 1 : 0, transition: 'all 450ms cubic-bezier(.3,1.5,.5,1) 900ms' }}>Notice sent · EN / اردو</div>
  </div>
);

const STOPS = [
  { id: 'join', when: 'August', short: 'Joining', title: 'A new family joins', text: 'An enquiry becomes an application, then a student record with guardians and documents.', Vis: Join },
  { id: 'reg', when: 'Every morning', short: 'Register', title: 'The register takes a minute', text: 'Teachers mark attendance, even without signal. Families see it on their phone.', Vis: Register },
  { id: 'plan', when: 'Through the term', short: 'Timetable', title: 'The week runs smoothly', text: 'A timetable with no double bookings, and cover found fast when a teacher is away.', Vis: Week },
  { id: 'exam', when: 'Exam season', short: 'Exams', title: 'Marks go in once', text: 'Enter marks by subject. Results and averages appear without a calculator.', Vis: Marks },
  { id: 'card', when: 'End of term', short: 'Report cards', title: 'Report cards you can trust', text: 'Each report card has a public check page, so anyone can confirm it is genuine.', Vis: Card },
  { id: 'fees', when: 'All year', short: 'Fees', title: 'Fees and notices on time', text: 'Fees tracked per child, and notices that reach families in English or Urdu.', Vis: Fees },
];

const StopCard = ({ stop, on, className = '', style }) => {
  const V = stop.Vis;
  return (
    <article className={`rounded-2xl border bg-white p-3.5 shadow-xl ${className}`} style={{ borderColor: on ? '#e0896f' : '#c9d3df', transition: 'border-color 400ms', ...style }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#8a4636' }}>{stop.when}</p>
      <h3 className="mt-0.5 font-display text-[15px] font-bold leading-tight" style={{ color: '#1b2837' }}>{stop.title}</h3>
      <p className="mt-1 text-[13px] leading-[18px]" style={{ color: '#3b4a5c' }}>{stop.text}</p>
      <div className="mt-2 rounded-lg px-2.5 py-2" style={{ background: '#f7f6f2' }} aria-hidden="true" data-no-i18n><V on={on} /></div>
    </article>
  );
};

/* ───────── the pinned, scroll-driven version (wide screens) ───────── */
function Pinned() {
  const track = useRef(null); const stage = useRef(null); const box = useRef(null);
  const base = useRef(null); const prog = useRef(null); const token = useRef(null); const fill = useRef(null);
  const live = useRef({ p: 0, len: 0, pts: null });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pts, setPts] = useState(null);
  const [n, setN] = useState(0);

  // measure the drawing area, so the path is drawn in real pixels (no stretched lines)
  useLayoutEffect(() => {
    const el = box.current; if (!el) return undefined;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', read); return () => window.removeEventListener('resize', read); }
    const ro = new ResizeObserver(read); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = size.w ? (() => {
    const { w, h } = size; const y = (o) => (h * 0.5 + o * h * 0.055).toFixed(1); const x = (f) => (f * w).toFixed(1);
    return `M0 ${y(0)} C${x(0.08)} ${y(-1)} ${x(0.17)} ${y(-1)} ${x(0.27)} ${y(0)} S${x(0.46)} ${y(1)} ${x(0.54)} ${y(0)} S${x(0.7)} ${y(-1)} ${x(0.79)} ${y(0)} S${x(0.93)} ${y(1)} ${w} ${y(0)}`;
  })() : '';

  const apply = useCallback(() => {
    const L = live.current; const b = base.current; if (!b || !L.len) return;
    const pt = b.getPointAtLength(L.len * L.p);
    if (token.current) token.current.style.transform = `translate3d(${pt.x}px, ${pt.y}px, 0) translate(-50%, -50%)`;
    if (prog.current) prog.current.style.strokeDashoffset = String(L.len * (1 - L.p));
    if (fill.current) fill.current.style.width = `${L.p * 100}%`;
    if (L.pts) { let c = 0; L.pts.forEach((s) => { if (L.p >= s.s - 0.03) c += 1; }); setN(c); }
  }, []);

  // find where each stop sits on the path
  useLayoutEffect(() => {
    const b = base.current; if (!b || !size.w) return;
    const len = b.getTotalLength(); const samples = [];
    for (let i = 0; i <= 400; i += 1) { const pt = b.getPointAtLength((len * i) / 400); samples.push({ x: pt.x, y: pt.y, s: i / 400 }); }
    const list = XS.map((f) => { const target = f * size.w; let best = samples[0]; samples.forEach((sm) => { if (Math.abs(sm.x - target) < Math.abs(best.x - target)) best = sm; }); return best; });
    live.current.len = len; live.current.pts = list;
    if (prog.current) prog.current.style.strokeDasharray = String(len);
    setPts(list);
  }, [d, size.w]);

  useEffect(() => {
    let raf = 0;
    const calc = () => {
      raf = 0; const t = track.current; const s = stage.current; if (!t || !s) return;
      const r = t.getBoundingClientRect(); const total = r.height - s.offsetHeight;
      live.current.p = total > 0 ? Math.min(1, Math.max(0, (HEADER - r.top) / total)) : 0;
      apply();
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(calc); };
    window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on, { passive: true });
    calc();
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [apply, pts]);

  const goTo = (i) => {
    const t = track.current; const s = stage.current; if (!t || !s || !pts) return;
    const total = t.offsetHeight - s.offsetHeight; const top = t.getBoundingClientRect().top + window.scrollY - HEADER;
    window.scrollTo({ top: top + Math.min(1, Math.max(0, pts[i].s - 0.02)) * total, behavior: 'smooth' });
  };

  const lit = Math.max(0, n - 1); const H = size.h;
  return (
    <div ref={track} style={{ height: '300vh' }}>
      <div ref={stage} className="sticky flex flex-col justify-center px-5 lg:px-8" style={{ top: HEADER, height: `calc(100vh - ${HEADER}px)` }}>
        <div ref={box} className="relative mx-auto w-full max-w-6xl" style={{ height: 'clamp(500px, calc(100vh - 230px), 600px)' }} role="group" aria-label="A school year in six steps">
          <svg className="absolute inset-0 h-full w-full" width={size.w} height={size.h} aria-hidden="true">
            <path ref={base} d={d} fill="none" stroke="#3a5478" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" />
            <path ref={prog} d={d} fill="none" stroke="#e0896f" strokeWidth="4" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 8px rgba(224,137,111,0.75))' }} />
          </svg>
          {pts && STOPS.map((st, i) => {
            const p = pts[i]; const on = n > i; const above = i % 2 === 0;
            return (
              <div key={st.id} className="absolute top-0 bottom-0" style={{ left: p.x, width: 0 }}>
                <span aria-hidden="true" className="absolute w-px" style={{ left: 0, background: on ? '#e0896f' : '#3a5478', transition: 'background 400ms', ...(above ? { top: CARD_H, height: Math.max(0, p.y - CARD_H - 15) } : { bottom: CARD_H, height: Math.max(0, H - p.y - CARD_H - 15) }) }} />
                <span aria-hidden="true" className={`absolute grid h-[30px] w-[30px] place-items-center rounded-full border-2 text-xs font-bold ${on ? 'site-ripple' : ''}`} style={{ left: 0, top: p.y, transform: 'translate(-50%, -50%)', background: on ? '#e0896f' : '#162a47', borderColor: on ? '#f4c4b3' : '#3a5478', color: on ? '#1b2837' : '#b4c6e4', transition: 'background 400ms, border-color 400ms, color 400ms' }}>{i + 1}</span>
                <StopCard stop={st} on={on} className="absolute" style={{ width: CARD_W, height: CARD_H, left: 0, ...(above ? { top: 0 } : { bottom: 0 }), opacity: on ? 1 : 0, transform: `translate(-50%, ${on ? 0 : above ? -14 : 14}px) scale(${on ? 1 : 0.95})`, transition: 'opacity 450ms, transform 550ms cubic-bezier(.2,.9,.3,1), border-color 400ms', pointerEvents: on ? 'auto' : 'none' }} />
              </div>
            );
          })}
          <span ref={token} aria-hidden="true" className="absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full" style={{ background: '#e0896f', color: '#1b2837', boxShadow: '0 0 0 6px rgba(224,137,111,0.25), 0 8px 22px rgba(0,0,0,0.35)', willChange: 'transform' }}>
            <GraduationCap className="h-5 w-5" />
          </span>
        </div>
        <div className="mx-auto mt-3 flex w-full max-w-6xl items-center gap-4">
          <div className="w-36 flex-shrink-0">
            <p key={lit} className={`${n ? 'site-pop' : ''} font-display text-xl font-bold`} style={{ color: '#fff' }}>{n ? STOPS[lit].when : 'Scroll to begin'}</p>
            {n === 0 && <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#f0a58c' }}><MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" /> Keep scrolling</p>}
          </div>
          <div className="relative flex-1">
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }}><div ref={fill} className="h-full rounded-full" style={{ background: '#e0896f', width: 0 }} /></div>
            <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${STOPS.length}, 1fr)` }}>
              {STOPS.map((st, i) => (
                <button key={st.id} type="button" onClick={() => goTo(i)} aria-label={`Jump to: ${st.title}`} aria-current={n === i + 1 ? 'step' : undefined} className="truncate rounded px-1 py-0.5 text-center text-xs font-bold transition hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ color: n > i ? '#fff' : '#b4c6e4' }}>{st.short}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── the plain version (phones, short screens, reduced motion) ───────── */
function PlainCard({ stop, still }) {
  const [ref, seen] = useInView({ margin: '0px 0px -12% 0px' });
  return <div ref={ref}><StopCard stop={stop} on={still || seen} className="h-full" /></div>;
}
function Plain({ still }) {
  return (
    <div className="mt-10 px-5 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {STOPS.map((st) => <PlainCard key={st.id} stop={st} still={still} />)}
      </div>
    </div>
  );
}

function usePinned() {
  const reduced = useReducedMotion();
  const get = () => typeof window !== 'undefined' && window.innerWidth >= 1024 && window.innerHeight >= 690;
  const [ok, setOk] = useState(get);
  useEffect(() => { const on = () => setOk(get()); window.addEventListener('resize', on, { passive: true }); return () => window.removeEventListener('resize', on); }, []);
  return { pinned: ok && !reduced, reduced };
}

export default function SchoolYear() {
  const { pinned, reduced } = usePinned();
  return (
    <section id="year" className="relative scroll-mt-16 py-16 lg:pb-0 lg:pt-24" style={{ background: 'linear-gradient(180deg,#0d2530 0%,#10222f 55%,#0f1b2d 100%)', color: '#fff' }}>
      <div className="px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHead light eyebrow="One school year" title="A school year, in motion" text="Follow one year at a school, from the first enquiry to the last fee receipt. Scroll, and watch each part of school life come alive." />
        </div>
      </div>
      {pinned ? <div className="mt-8"><Pinned /></div> : <Plain still={reduced} />}
      <div className="px-5 lg:px-8"><p className="mx-auto mt-6 max-w-7xl text-xs" style={{ color: '#9fb6dc' }}>The pictures show sample data to explain how each part works.</p></div>
      <div className="h-10" />
    </section>
  );
}
