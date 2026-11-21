import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Bell, Check, ChevronLeft, ChevronRight, LayoutDashboard, MessageCircle, Pause, Play, RotateCcw, Search, UserCheck, Users, Wallet, X,
} from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { SectionHead } from './ui';
import { useSite } from './SiteShell';
import { useInView, useNarrow, useReducedMotion } from './useMotion';
import { whatsappLink } from './siteData';

/* "Try it yourself": a small, safe copy of the product with sample data. A cursor shows the way until the visitor takes over.
   Nothing here talks to the server and nothing is saved. */

const FEE = 6500;
const SEED = [
  { id: 's1', name: 'Ayesha Khan', cls: '7-A', att: 96, here: true, due: 0 },
  { id: 's2', name: 'Bilal Ahmed', cls: '7-A', att: 91, here: true, due: 3500 },
  { id: 's3', name: 'Hira Noor', cls: '7-A', att: 88, here: true, due: FEE },
  { id: 's4', name: 'Usman Tariq', cls: '7-A', att: 97, here: true, due: 0 },
  { id: 's5', name: 'Zainab Ali', cls: '7-A', att: 84, here: false, due: FEE },
  { id: 's6', name: 'Hamza Raza', cls: '7-A', att: 93, here: true, due: 0 },
  { id: 's7', name: 'Maryam Iqbal', cls: '7-A', att: 99, here: true, due: 0 },
  { id: 's8', name: 'Saad Malik', cls: '7-A', att: 79, here: false, due: FEE },
];
const SEED_FEED = [
  { id: 'f1', text: 'Register taken for 7-A', time: '8:05' },
  { id: 'f2', text: 'Notice sent: Parents’ meeting', time: '8:40' },
];
const NAV = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'students', label: 'Students', Icon: Users },
  { id: 'fees', label: 'Fees', Icon: Wallet },
];
const SCRIPT = [
  { t: 'nav-students', wait: 1000 },
  { t: 'row-s3', wait: 1300 },
  { t: 'pay-open', wait: 1100 },
  { t: 'pay-confirm', wait: 2300 },
  { t: 'drawer-close', wait: 800 },
  { t: 'nav-dashboard', wait: 3200 },
  { reset: true, wait: 900 },
];
const rs = (n) => `Rs ${n.toLocaleString('en-US')}`;
const initials = (name) => name.split(' ').map((w) => w[0]).join('');
const statusOf = (s) => (s.due === 0 ? 'Paid' : s.due === FEE ? 'Due' : 'Part paid');
const CHIP = { Paid: { bg: '#e1f1ec', fg: '#1f5e53' }, Due: { bg: '#fbe6df', fg: '#8a3d2a' }, 'Part paid': { bg: '#fdf1d3', fg: '#7a5a0a' } };

function Chip({ s }) { const c = CHIP[s]; return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: c.bg, color: c.fg }}>{s}</span>; }
function Avatar({ name, big }) { return <span aria-hidden="true" className={`grid flex-shrink-0 place-items-center rounded-full font-bold text-white ${big ? 'h-12 w-12 text-base' : 'h-8 w-8 text-[11px]'}`} style={{ background: '#2a5cac' }}>{initials(name)}</span>; }

// number that counts up when it first appears and whenever it changes
function useCount(target, reduced, ms = 900) {
  const [v, setV] = useState(reduced ? target : 0); const from = useRef(reduced ? target : 0);
  useEffect(() => {
    if (reduced) { setV(target); from.current = target; return undefined; }
    let raf = 0; const t0 = performance.now(); const a = from.current;
    const tick = (t) => { const k = Math.min(1, (t - t0) / ms); const val = Math.round(a + (target - a) * (1 - (1 - k) ** 3)); setV(val); from.current = val; if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, ms]);
  return v;
}

function Kpi({ label, value, money, reduced, tone }) {
  const v = useCount(value, reduced);
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: '#e3e7e7', background: '#fff' }}>
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#5b6b7b' }}>{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums sm:text-2xl" style={{ color: tone }}>{money ? rs(v) : v}</p>
    </div>
  );
}

function Dashboard({ students, feed, reduced }) {
  const present = students.filter((s) => s.here).length;
  const total = students.length * FEE; const due = students.reduce((a, s) => a + s.due, 0); const got = total - due;
  const week = [92, 95, 90, 96, 88];
  return (
    <div className="site-pop space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Students" value={students.length} reduced={reduced} tone="#1b2837" />
        <Kpi label="Present today" value={present} reduced={reduced} tone="#1f5e53" />
        <Kpi label="Collected" value={got} money reduced={reduced} tone="#2a5cac" />
        <Kpi label="Still due" value={due} money reduced={reduced} tone="#8a3d2a" />
      </div>
      <div className="grid gap-3 md:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border p-3" style={{ borderColor: '#e3e7e7', background: '#fff' }}>
          <p className="text-xs font-bold" style={{ color: '#1b2837' }}>Attendance this week</p>
          <div className="mt-3 flex h-24 items-end gap-3">
            {week.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <i className="block w-full rounded-t-md" style={{ height: Math.round(v * 0.7), background: i === 4 ? '#2a5cac' : '#b9c9e6', transformOrigin: 'bottom', animation: reduced ? 'none' : `site-grow 700ms ${i * 90}ms cubic-bezier(.2,.9,.3,1) both` }} />
                <span className="text-[10px] font-bold" style={{ color: '#5b6b7b' }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: '#e3e7e7', background: '#fff' }}>
          <p className="text-xs font-bold" style={{ color: '#1b2837' }}>Recent activity</p>
          <ul className="mt-2 space-y-2">
            {feed.slice(0, 4).map((f) => (
              <li key={f.id} className="site-in-right flex items-start gap-2 text-xs" style={{ color: '#3b4a5c' }}>
                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: f.pay ? '#2c776c' : '#2a5cac' }} />
                <span className="flex-1">{f.text}</span><span style={{ color: '#4f5f70' }}>{f.time}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StudentsView({ students, q, setQ, open, sel }) {
  const list = students.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="site-pop">
      <div className="relative mb-3 max-w-xs">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: '#6b7b8b' }} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" aria-label="Search students" placeholder="Search students" className="w-full rounded-lg border py-2 pe-3 ps-9 text-sm focus:outline-none focus-visible:ring-2" style={{ borderColor: '#cbd5dd', background: '#fff', color: '#1b2837' }} />
      </div>
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: '#e3e7e7', background: '#fff' }}>
        <table className="w-full text-start text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wider" style={{ background: '#f7f6f2', color: '#5b6b7b' }}>
            <th scope="col" className="px-3 py-2 text-start font-bold">Student</th><th scope="col" className="hidden px-3 py-2 text-start font-bold sm:table-cell">Class</th>
            <th scope="col" className="hidden px-3 py-2 text-start font-bold md:table-cell">Attendance</th><th scope="col" className="px-3 py-2 text-start font-bold">Fees</th>
          </tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} onClick={(e) => { if (e.target.tagName !== 'BUTTON') open(s.id, e); }} className="cursor-pointer border-t transition hover:bg-[#f2f6fc]" style={{ borderColor: '#eef1f3', background: sel === s.id ? '#eaf1fb' : undefined }}>
                <td className="px-3 py-2"><button type="button" data-demo={`row-${s.id}`} onClick={(e) => { e.stopPropagation(); open(s.id, e); }} className="flex items-center gap-2 text-start font-semibold focus:outline-none focus-visible:ring-2" style={{ color: '#1b2837' }}><Avatar name={s.name} />{s.name}</button></td>
                <td className="hidden px-3 py-2 sm:table-cell" style={{ color: '#3b4a5c' }}>{s.cls}</td>
                <td className="hidden px-3 py-2 md:table-cell"><span className="inline-flex items-center gap-2"><i className="block h-1.5 w-16 overflow-hidden rounded-full" style={{ background: '#e3e7e7' }}><b className="block h-full rounded-full" style={{ width: `${s.att}%`, background: s.att >= 90 ? '#2c776c' : '#d9826a' }} /></i><span className="text-xs tabular-nums" style={{ color: '#3b4a5c' }}>{s.att}%</span></span></td>
                <td className="px-3 py-2"><Chip s={statusOf(s)} /></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="4" className="px-3 py-6 text-center text-sm" style={{ color: '#5b6b7b' }}>No student matches that name.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeesView({ students, startPay }) {
  const total = students.length * FEE; const due = students.reduce((a, s) => a + s.due, 0); const pct = Math.round(((total - due) / total) * 100);
  const owing = students.filter((s) => s.due > 0);
  return (
    <div className="site-pop space-y-3">
      <div className="rounded-xl border p-3" style={{ borderColor: '#e3e7e7', background: '#fff' }}>
        <div className="flex items-center justify-between text-xs font-bold" style={{ color: '#1b2837' }}><span>This month’s fees, class 7-A</span><span className="tabular-nums">{pct}% collected</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ background: '#e3e7e7' }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#2a5cac,#2c776c)', transition: 'width 800ms cubic-bezier(.2,.9,.3,1)' }} /></div>
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border" style={{ borderColor: '#e3e7e7', background: '#fff' }}>
        {owing.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5" style={{ borderColor: '#eef1f3' }}>
            <Avatar name={s.name} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" style={{ color: '#1b2837' }}>{s.name}</p><p className="text-xs" style={{ color: '#5b6b7b' }}>{rs(s.due)} due</p></div>
            <button type="button" onClick={(e) => startPay(s.id, e)} className="rounded-lg border px-3 py-1.5 text-xs font-bold transition hover:bg-[#2a5cac] hover:text-white focus:outline-none focus-visible:ring-2" style={{ borderColor: '#2a5cac', color: '#2a5cac' }}>Record payment</button>
          </li>
        ))}
        {!owing.length && <li className="px-3 py-6 text-center text-sm font-semibold" style={{ color: '#1f5e53' }}>Everyone has paid. Well done!</li>}
      </ul>
    </div>
  );
}

function Drawer({ s, close, startPay, note }) {
  const C = 2 * Math.PI * 22;
  return (
    <aside role="complementary" aria-label="Student details" className="site-in-right absolute inset-y-0 end-0 z-20 flex w-full flex-col border-s shadow-2xl sm:w-[290px]" style={{ background: '#fff', borderColor: '#e3e7e7' }}>
      <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: '#e3e7e7' }}>
        <Avatar name={s.name} big /><div className="min-w-0 flex-1"><p className="truncate font-display text-base font-bold" style={{ color: '#1b2837' }}>{s.name}</p><p className="text-xs" style={{ color: '#5b6b7b' }}>Class {s.cls}</p></div>
        <button type="button" data-demo="drawer-close" onClick={close} aria-label="Close student details" className="rounded-lg p-1.5 hover:bg-[#f2f6fc] focus:outline-none focus-visible:ring-2" style={{ color: '#3b4a5c' }}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3 text-center" style={{ borderColor: '#e3e7e7' }}>
            <svg viewBox="0 0 54 54" width="54" height="54" className="mx-auto" aria-hidden="true"><circle cx="27" cy="27" r="22" fill="none" stroke="#e3e7e7" strokeWidth="5" /><circle cx="27" cy="27" r="22" fill="none" stroke={s.att >= 90 ? '#2c776c' : '#d9826a'} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - s.att / 100)} transform="rotate(-90 27 27)" style={{ transition: 'stroke-dashoffset 900ms' }} /><text x="27" y="31" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1b2837">{s.att}%</text></svg>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#5b6b7b' }}>Attendance</p>
          </div>
          <div className="rounded-xl border p-3 text-center" style={{ borderColor: '#e3e7e7' }}>
            <p className="font-display text-lg font-bold tabular-nums" style={{ color: s.due ? '#8a3d2a' : '#1f5e53' }}>{s.due ? rs(s.due) : 'Rs 0'}</p>
            <div className="mt-1"><Chip s={statusOf(s)} /></div>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#5b6b7b' }}>Fees due</p>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs" style={{ color: '#3b4a5c' }}>
          <li className="flex items-center gap-2"><UserCheck className="h-3.5 w-3.5" style={{ color: s.here ? '#2c776c' : '#d9826a' }} aria-hidden="true" />{s.here ? 'Present today' : 'Absent today'}</li>
          <li className="flex items-center gap-2"><Bell className="h-3.5 w-3.5" style={{ color: '#2a5cac' }} aria-hidden="true" />Guardian receives notices on their phone</li>
        </ul>
      </div>
      <div className="space-y-2 border-t p-4" style={{ borderColor: '#e3e7e7' }}>
        {s.due > 0
          ? <button type="button" data-demo="pay-open" onClick={(e) => startPay(s.id, e)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/40" style={{ background: '#2a5cac' }}><Wallet className="h-4 w-4" aria-hidden="true" /> Record payment</button>
          : <p className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold" style={{ background: '#e1f1ec', color: '#1f5e53' }}><Check className="h-4 w-4" aria-hidden="true" /> Fees paid</p>}
        <button type="button" onClick={() => note('This is a sample, so no message is sent.')} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold hover:bg-[#f2f6fc] focus:outline-none focus-visible:ring-2" style={{ borderColor: '#cbd5dd', color: '#1b2837' }}><MessageCircle className="h-4 w-4" aria-hidden="true" /> Message guardian</button>
      </div>
    </aside>
  );
}

function PayModal({ s, pay, setPay, confirm, cancel }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  const amt = Number(pay.amount) || 0; const bad = amt < 1 || amt > s.due;
  return (
    <div className="absolute inset-0 z-30 grid place-items-center p-4" style={{ background: 'rgba(15,27,45,0.45)' }}>
      <div role="dialog" aria-modal="true" aria-label={`Record a payment for ${s.name}`} className="site-pop w-full max-w-xs rounded-2xl p-5 shadow-2xl" style={{ background: '#fff' }}>
        {pay.done ? (
          <div className="py-4 text-center" aria-live="polite">
            <svg viewBox="0 0 52 52" width="64" height="64" className="mx-auto" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="#e1f1ec" /><path d="M15 27l8 8 14-17" fill="none" stroke="#1f5e53" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 40, strokeDashoffset: 0, animation: 'site-check 520ms ease-out both' }} /></svg>
            <p className="mt-3 font-display text-lg font-bold" style={{ color: '#1b2837' }}>Payment recorded</p>
            <p className="mt-1 text-sm" style={{ color: '#3b4a5c' }}>Receipt {pay.receipt} created for {s.name}.</p>
          </div>
        ) : (
          <>
            <h3 className="font-display text-lg font-bold" style={{ color: '#1b2837' }}>Record a payment</h3>
            <p className="mt-0.5 text-xs" style={{ color: '#5b6b7b' }}>{s.name} · {rs(s.due)} due</p>
            <label className="mt-4 block text-xs font-bold" style={{ color: '#1b2837' }} htmlFor="demo-amt">Amount (Rs)</label>
            <input id="demo-amt" type="number" min="1" max={s.due} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums focus:outline-none focus-visible:ring-2" style={{ borderColor: bad ? '#d9826a' : '#cbd5dd', color: '#1b2837' }} />
            {bad && <p className="mt-1 text-xs" style={{ color: '#8a3d2a' }}>Enter an amount between 1 and {s.due.toLocaleString('en-US')}.</p>}
            <fieldset className="mt-3"><legend className="text-xs font-bold" style={{ color: '#1b2837' }}>Paid by</legend>
              <div className="mt-1 flex gap-2">
                {['Cash', 'Bank', 'Wallet'].map((m) => (
                  <label key={m} className="flex-1 cursor-pointer"><input type="radio" name="demo-method" className="peer sr-only" checked={pay.method === m} onChange={() => setPay({ ...pay, method: m })} />
                    <span className="block rounded-lg border px-2 py-1.5 text-center text-xs font-bold transition peer-checked:border-[#2a5cac] peer-checked:bg-[#eaf1fb] peer-focus-visible:ring-2" style={{ borderColor: '#cbd5dd', color: '#1b2837' }}>{m}</span></label>
                ))}
              </div>
            </fieldset>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={cancel} className="flex-1 rounded-lg border px-3 py-2 text-sm font-bold hover:bg-[#f2f6fc] focus:outline-none focus-visible:ring-2" style={{ borderColor: '#cbd5dd', color: '#1b2837' }}>Cancel</button>
              <button ref={ref} type="button" data-demo="pay-confirm" disabled={bad} onClick={confirm} className="flex-1 rounded-lg px-3 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/40" style={{ background: '#2a5cac' }}>Confirm</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const TASKS = [
  { id: 'open', t: 'Open a student', hint: 'Choose a name in the Students list.' },
  { id: 'pay', t: 'Record a payment', hint: 'Use “Record payment” on someone who owes fees.' },
  { id: 'dash', t: 'Watch the numbers change', hint: 'Go back to the Dashboard.' },
];

export default function LiveDemo() {
  const { openAsk, jump } = useSite();
  const reduced = useReducedMotion(); const narrow = useNarrow(640);
  const [wrapRef, inView] = useInView({ once: false, threshold: 0.35 });
  const win = useRef(null); const timers = useRef([]);
  const [view, setView] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [students, setStudents] = useState(SEED); const [feed, setFeed] = useState(SEED_FEED);
  const [q, setQ] = useState(''); const [sel, setSel] = useState(null); const [pay, setPay] = useState(null); const [toast, setToast] = useState(null);
  const [done, setDone] = useState({}); const [auto, setAuto] = useState(true);
  const [cursor, setCursor] = useState({ x: 0, y: 0, on: false, press: false });
  const receipt = useRef(1042);
  useEffect(() => { setCollapsed(narrow); }, [narrow]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); return id; };
  const note = useCallback((text) => { setToast(text); later(() => setToast(null), 2800); }, []);
  const mark = (id, e) => { if (e && e.nativeEvent && e.nativeEvent.isTrusted) setDone((d) => ({ ...d, [id]: true })); };
  const go = (v, e) => { setView(v); setSel(null); if (v === 'dashboard' && done.pay) mark('dash', e); };
  const open = (id, e) => { setSel(id); mark('open', e); };
  const startPay = (id) => { const s = students.find((x) => x.id === id); setSel(id); setPay({ id, amount: String(s.due), method: 'Cash', done: false }); };
  const confirm = (e) => {
    const s = students.find((x) => x.id === pay.id); const amt = Math.min(s.due, Math.max(1, Number(pay.amount) || 0));
    receipt.current += 1; const rc = `R-${receipt.current}`;
    setStudents((list) => list.map((x) => (x.id === s.id ? { ...x, due: x.due - amt } : x)));
    setFeed((f) => [{ id: `p${receipt.current}`, text: `${s.name} paid ${rs(amt)} (${pay.method})`, time: 'Just now', pay: true }, ...f]);
    setPay({ ...pay, done: true, receipt: rc });
    if (e && e.nativeEvent && e.nativeEvent.isTrusted) setDone((d) => ({ ...d, pay: true }));
    later(() => setPay(null), 1700);
  };
  const reset = useCallback(() => { setView('dashboard'); setStudents(SEED); setFeed(SEED_FEED); setSel(null); setPay(null); setToast(null); setQ(''); receipt.current = 1042; }, []);

  // the guided tour: a cursor moves to each target and presses it, until the visitor takes over
  useEffect(() => {
    if (!auto || !inView || reduced || !win.current) return undefined;
    let alive = true; let timer = 0; let i = 0; let t2 = 0;
    const run = () => {
      if (!alive) return;
      const st = SCRIPT[i % SCRIPT.length];
      if (st.reset) { reset(); i += 1; timer = setTimeout(run, st.wait); return; }
      const el = win.current && win.current.querySelector(`[data-demo="${st.t}"]`);
      if (!el) { i += 1; timer = setTimeout(run, 250); return; }
      const a = win.current.getBoundingClientRect(); const b = el.getBoundingClientRect();
      setCursor({ x: b.left - a.left + Math.min(b.width * 0.5, 46), y: b.top - a.top + b.height * 0.55, on: true, press: false });
      timer = setTimeout(() => {
        if (!alive) return;
        setCursor((c) => ({ ...c, press: true })); t2 = setTimeout(() => setCursor((c) => ({ ...c, press: false })), 180);
        el.click(); i += 1; timer = setTimeout(run, st.wait);
      }, 900);
    };
    timer = setTimeout(run, 800);
    return () => { alive = false; clearTimeout(timer); clearTimeout(t2); setCursor((c) => ({ ...c, on: false, press: false })); };
  }, [auto, inView, reduced, reset]);

  const stop = () => { if (auto) setAuto(false); };
  const onKey = (e) => { stop(); if (e.key === 'Escape') { if (pay) setPay(null); else if (sel) setSel(null); } };
  const replay = () => { reset(); setDone({}); setAuto(true); };
  const selStudent = students.find((s) => s.id === sel);
  const payStudent = pay && students.find((s) => s.id === pay.id);
  const nextTask = TASKS.find((t) => !done[t.id]);

  return (
    <section id="try" ref={wrapRef} className="relative scroll-mt-20 overflow-x-clip px-5 py-16 lg:px-8 lg:py-24" style={{ background: 'linear-gradient(180deg,#f7f6f2 0%,#e9eff8 100%)' }}>
      <div aria-hidden="true" className="pointer-events-none absolute -end-24 top-10 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(42,92,172,0.18)' }} />
      <div aria-hidden="true" className="pointer-events-none absolute -start-24 bottom-10 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(44,119,108,0.16)' }} />
      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.78fr_1.5fr] lg:items-center">
        <div>
          <SectionHead eyebrow="Hands-on demo" title="Try Aulensia without signing up" text="This small, safe copy of the product uses sample data. Open a student, record a fee payment and watch the numbers update. Nothing is saved." />
          <ol className="mt-6 space-y-2.5" aria-label="Things to try">
            {TASKS.map((t) => (
              <li key={t.id} className="flex items-start gap-3 rounded-xl border p-3 transition" style={{ borderColor: done[t.id] ? '#2c776c' : '#c9d3df', background: done[t.id] ? '#e8f4f0' : '#fff' }}>
                <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: done[t.id] ? '#2c776c' : '#e3e7e7', color: done[t.id] ? '#fff' : '#3b4a5c' }}>{done[t.id] ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : TASKS.indexOf(t) + 1}</span>
                <div><p className="text-sm font-bold" style={{ color: '#1b2837' }}>{t.t}</p><p className="text-xs" style={{ color: '#3b4a5c' }}>{t.hint}</p></div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm font-semibold" style={{ color: '#1f5e53' }} aria-live="polite">{nextTask ? '' : 'You have tried the main steps. The real product does the same with your own data.'}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => openAsk('demo')} className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/40" style={{ background: '#2a5cac' }}>Request a live demo <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></button>
            <a href={whatsappLink('Hello Aulensia, I tried the demo and would like to talk.')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border px-5 py-3 text-sm font-bold transition hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0f7a6a]/40" style={{ borderColor: '#0f7a6a', color: '#0f6a5b' }}><FaWhatsapp className="h-4 w-4" aria-hidden="true" /> Chat on WhatsApp</a>
          </div>
          <button type="button" onClick={() => jump('demo')} className="mt-4 text-sm font-bold underline underline-offset-4 hover:no-underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/40" style={{ color: '#2a5cac' }}>Or sign in to the full demo school</button>
        </div>

        <div className="relative min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: '#5b6b7b' }}>Sample data · nothing is saved</p>
            <div className="flex items-center gap-2">
              {!reduced && (
                <button type="button" onClick={() => setAuto((a) => !a)} aria-pressed={auto} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/40" style={{ borderColor: '#c9d3df', background: '#fff', color: '#1b2837' }}>
                  {auto ? <><Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pause tour</> : <><Play className="h-3.5 w-3.5" aria-hidden="true" /> Play tour</>}
                </button>
              )}
              <button type="button" onClick={replay} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-[#2a5cac]/40" style={{ borderColor: '#c9d3df', background: '#fff', color: '#1b2837' }}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Start over</button>
            </div>
          </div>

          <div ref={win} role="region" aria-label="Interactive demo with sample data" dir="ltr" data-no-i18n onPointerDown={stop} onKeyDown={onKey} className="relative flex h-[560px] overflow-hidden rounded-2xl border shadow-2xl" style={{ borderColor: '#c9d3df', background: '#f4f6f9' }}>
            <nav aria-label="Demo menu" className="flex flex-shrink-0 flex-col border-e py-3" style={{ width: collapsed ? 56 : 172, background: '#fff', borderColor: '#e3e7e7', transition: 'width 280ms cubic-bezier(.2,.9,.3,1)' }}>
              <div className="mb-3 flex items-center gap-2 px-3"><span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: '#2a5cac' }}>A</span>{!collapsed && <span className="font-display text-sm font-bold" style={{ color: '#1b2837' }}>Aulensia</span>}</div>
              {NAV.map(({ id, label, Icon }) => (
                <button key={id} type="button" data-demo={`nav-${id}`} onClick={(e) => go(id, e)} aria-current={view === id ? 'page' : undefined} aria-label={collapsed ? label : undefined} className="mx-2 mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2" style={{ background: view === id ? '#eaf1fb' : 'transparent', color: view === id ? '#2a5cac' : '#3b4a5c' }}>
                  <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />{!collapsed && label}
                </button>
              ))}
              <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} className="mx-2 mt-auto flex items-center justify-center rounded-lg p-2 hover:bg-[#f2f6fc] focus:outline-none focus-visible:ring-2" style={{ color: '#5b6b7b' }}>{collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronLeft className="h-4 w-4" aria-hidden="true" />}</button>
            </nav>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b px-4 py-3" style={{ background: '#fff', borderColor: '#e3e7e7' }}>
                <h3 className="font-display text-base font-bold" style={{ color: '#1b2837' }}>{NAV.find((n) => n.id === view).label}</h3>
                <span className="text-xs font-semibold" style={{ color: '#5b6b7b' }}>Class 7-A · Sample school</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {view === 'dashboard' && <Dashboard students={students} feed={feed} reduced={reduced} />}
                {view === 'students' && <StudentsView students={students} q={q} setQ={setQ} open={open} sel={sel} />}
                {view === 'fees' && <FeesView students={students} startPay={startPay} />}
              </div>
            </div>
            {selStudent && <Drawer s={selStudent} close={() => setSel(null)} startPay={startPay} note={note} />}
            {pay && payStudent && <PayModal s={payStudent} pay={pay} setPay={setPay} confirm={confirm} cancel={() => setPay(null)} />}
            {toast && <div role="status" className="site-pop absolute bottom-4 start-1/2 z-40 -translate-x-1/2 rounded-lg px-4 py-2 text-xs font-bold shadow-xl" style={{ background: '#1b2837', color: '#fff' }}>{toast}</div>}
            <span aria-hidden="true" className="pointer-events-none absolute start-0 top-0 z-50" style={{ transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`, opacity: cursor.on ? 1 : 0, transition: 'transform 850ms cubic-bezier(.3,.8,.2,1), opacity 300ms' }}>
              <svg viewBox="0 0 24 24" width="26" height="26" style={{ transform: cursor.press ? 'scale(0.82)' : 'scale(1)', transition: 'transform 120ms', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }}><path d="M4 2l15 9-6.5 1.6L9.4 19z" fill="#1b2837" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
              {cursor.press && <span className="absolute -start-2 -top-2 h-8 w-8 rounded-full" style={{ background: 'rgba(224,137,111,0.45)' }} />}
            </span>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs" style={{ color: '#5b6b7b' }}><Bell className="h-3.5 w-3.5" aria-hidden="true" /> The guided tour stops as soon as you click or type, and you stay in control.</p>
        </div>
      </div>
    </section>
  );
}
