import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Bell, BookOpen, Camera, Check, Cpu, FileText, Lock, MessageSquare, Pause, PenLine, Play, ScanFace, ShieldAlert, ShieldCheck, Sparkles, UserCheck, Wifi,
} from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { SectionHead, tabKeys } from './ui';
import { useInView, useReducedMotion } from './useMotion';
import { whatsappLink } from './siteData';
import AiRobot, { TONES } from './AiRobot';
import { CctvPreview, FacePreview, PaperPreview } from './AiPreviews';

/* "AI automation: coming next". A control-center style preview of three planned helpers. They are plans, shown as animated previews:
   nothing on this page claims that they are released. The colours carry meaning (see the guide under the stage). */

const KIND = { input: 'live', ai: 'ai', review: 'review', alert: 'alert', done: 'done' };
const KIND_LABEL = { input: 'Live input', ai: 'AI is working', review: 'A person checks', alert: 'Needs attention', done: 'Done' };

const WF = [
  {
    id: 'paper', Icon: FileText, title: 'Term paper from taught chapters', status: 'Builds on today’s writing assistant', Preview: PaperPreview,
    blurb: 'Choose the class and book series, say which chapters you have taught, and AI drafts the first-term paper. The teacher approves it.',
    why: 'Takes away the slow part of paper-setting, so teachers can spend that time teaching.',
    nodes: [
      { k: 'input', Icon: MessageSquare, t: 'Teacher asks', d: 'Pick the class and book series, then say which chapters you have taught.' },
      { k: 'ai', Icon: Sparkles, t: 'AI reads the plan', d: 'It works from the chapter topics and notes you give it, so nothing untaught appears.' },
      { k: 'ai', Icon: BookOpen, t: 'AI drafts the paper', d: 'Choice, short and long questions that add up to 50 marks.' },
      { k: 'review', Icon: PenLine, t: 'Teacher reviews', d: 'Edit, swap or remove any question. Nothing is final until it is approved.' },
      { k: 'done', Icon: Check, t: 'Paper ready', d: 'Print it, or share it with the class.' },
    ],
    robot: ['Tell me what you taught.', 'Got it: chapters 1 to 3.', 'Reading the chapter topics…', 'Drafting 17 questions…', 'Your turn: please review.', 'All done. Ready to print!'],
    tone: ['live', 'live', 'ai', 'ai', 'review', 'done'],
    events: [null,
      { tag: 'live', title: 'Paper requested', meta: 'Class 12 · Star Edition · Ch 1 to 3' },
      { tag: 'ai', title: 'Chapter topics matched', meta: 'Chapters 1, 2 and 3' },
      { tag: 'ai', title: 'First draft ready', meta: '17 questions · 50 marks' },
      { tag: 'review', title: 'Waiting for the teacher', meta: 'Review every question' },
      { tag: 'done', title: 'Paper approved', meta: 'Ready to print or share' }],
  },
  {
    id: 'watch', Icon: Camera, title: 'Safer classrooms', status: 'Planned', Preview: CctvPreview,
    blurb: 'AI watches the school’s cameras for a possible accident, such as a fall, and alerts the right people at once. A person always reviews it.',
    why: 'Helps staff notice an accident sooner, so help reaches a child sooner.',
    nodes: [
      { k: 'input', Icon: Camera, t: 'Camera sees', d: 'Works with the network cameras your school already has.' },
      { k: 'ai', Icon: Activity, t: 'AI watches', d: 'It looks for a possible fall or an unusual crowd, and ignores normal movement.' },
      { k: 'ai', Icon: ShieldAlert, t: 'Is it serious?', d: 'It decides how urgent it looks and how sure it is. When unsure, it asks a person.' },
      { k: 'alert', Icon: Bell, t: 'Right people told', d: 'The principal and the nurse get an alert in the app straight away.' },
      { k: 'review', Icon: ShieldCheck, t: 'A person decides', d: 'Someone reviews the clip and closes the alert. The AI never decides alone.' },
    ],
    robot: ['Watching quietly…', 'Camera 3 is live.', 'Hmm, a child may have fallen!', 'Checking how serious…', 'Telling the principal and nurse.', 'A person has it from here.'],
    tone: ['live', 'live', 'alert', 'alert', 'alert', 'done'],
    events: [null,
      { tag: 'live', title: 'Camera 3 connected', meta: 'Class 9-B' },
      { tag: 'alert', title: 'Possible fall detected', meta: 'Class 9-B · Camera 3' },
      { tag: 'ai', title: 'Looks serious, not certain', meta: 'A person will decide' },
      { tag: 'alert', title: 'Principal and nurse alerted', meta: 'Alert sent in the app' },
      { tag: 'done', title: 'Alert closed by a person', meta: 'Clip saved to the log' }],
  },
  {
    id: 'face', Icon: ScanFace, title: 'Attendance at the door', status: 'Planned', Preview: FacePreview,
    blurb: 'A camera at the classroom door recognises children whose parents have agreed, and fills in the register. The teacher signs it off.',
    why: 'The register fills itself, so the first minutes of every lesson go to teaching.',
    nodes: [
      { k: 'input', Icon: Camera, t: 'Camera at the door', d: 'One ordinary camera at the classroom door is enough.' },
      { k: 'ai', Icon: ScanFace, t: 'AI finds faces', d: 'It finds each face as children walk in.' },
      { k: 'ai', Icon: UserCheck, t: 'AI matches names', d: 'It only matches children whose parents have agreed to this.' },
      { k: 'review', Icon: PenLine, t: 'Unsure? Teacher confirms', d: 'A match it is not sure about is shown to the teacher to confirm.' },
      { k: 'done', Icon: Check, t: 'Register filled', d: 'Parents see attendance in the app as they do today.' },
    ],
    robot: ['Waiting at the door…', 'Faces found!', 'Matching names…', 'One match is unsure. Asking the teacher.', 'Thanks, teacher!', 'The register is done.'],
    tone: ['live', 'live', 'ai', 'review', 'review', 'done'],
    events: [null,
      { tag: 'live', title: 'Door camera ready', meta: 'Class 7-A · 8:02' },
      { tag: 'ai', title: '5 faces found', meta: 'Matching enrolled photos' },
      { tag: 'review', title: 'One match not sure', meta: 'Teacher asked to confirm' },
      { tag: 'review', title: 'Teacher confirmed Hira Noor', meta: 'Register updated' },
      { tag: 'done', title: 'Register filled', meta: '5 of 6 present · teacher signed off' }],
  },
];

const FEED_ICON = { ai: Sparkles, alert: ShieldAlert, review: PenLine, live: Wifi, done: Check };
const SEED = [
  { tag: 'done', title: 'Fee reminder sent', meta: '12 families · Class 6' },
  { tag: 'live', title: 'Timetable updated', meta: 'Class 8 · Monday' },
];
const AGO = ['Just now', '1 min ago', '2 min ago', '4 min ago', '6 min ago', '9 min ago', '12 min ago'];
const FILTERS = [['all', 'All'], ['ai', 'AI'], ['alert', 'Alerts'], ['review', 'Needs you']];
const LEGEND = [['ai', 'AI is working'], ['live', 'Live from a camera or teacher'], ['review', 'A person must check'], ['alert', 'Needs urgent attention'], ['done', 'Done and approved']];

function Flow({ nodes, step }) {
  return (
    <ol className="flex items-stretch" aria-label="Workflow steps">
      {nodes.map((n, i) => {
        const tone = TONES[KIND[n.k]]; const st = step > i ? 'done' : step === i ? 'active' : 'idle'; const N = n.Icon;
        return (
          <li key={n.t} className="flex min-w-0 flex-1 items-center">
            <div aria-current={st === 'active' ? 'step' : undefined} className={`relative flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center ${st === 'active' ? 'ai-node' : ''}`} style={{ '--tone': tone.main, background: st === 'active' ? tone.soft : 'rgba(255,255,255,0.03)', border: `1px solid ${st === 'idle' ? 'rgba(160,180,255,0.18)' : st === 'done' ? 'rgba(73,224,160,0.5)' : tone.main}`, boxShadow: st === 'active' ? `0 0 24px ${tone.soft}` : 'none', transition: 'all 350ms' }}>
              <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: st === 'idle' ? 'rgba(255,255,255,0.06)' : st === 'done' ? 'rgba(73,224,160,0.2)' : tone.soft, color: st === 'done' ? TONES.done.main : st === 'idle' ? '#9db0d6' : tone.main, transition: 'all 350ms' }}>
                {st === 'done' ? <Check className="h-4 w-4" aria-hidden="true" /> : <N className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="px-0.5 text-[10px] font-bold leading-tight sm:text-xs" style={{ color: st === 'idle' ? '#9db0d6' : '#fff' }}>{n.t}</span>
            </div>
            {i < nodes.length - 1 && <span aria-hidden="true" className="relative mx-0.5 h-0.5 w-2 flex-shrink-0 overflow-hidden rounded sm:w-5" style={{ background: step > i ? TONES.done.main : 'rgba(160,180,255,0.22)', transition: 'background 400ms' }}>{step === i + 1 || step === i ? <i className="ai-flow absolute inset-0" style={{ background: `linear-gradient(90deg,transparent,${tone.main},transparent)` }} /> : null}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Feed({ items, flt, setFlt }) {
  const shown = items.filter((e) => flt === 'all' || e.tag === flt).slice(0, 7);
  return (
    <div className="flex h-full min-h-[300px] flex-col rounded-2xl p-3" style={{ background: 'linear-gradient(160deg,#101a33,#0b1226)', border: '1px solid rgba(160,180,255,0.16)' }}>
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-white"><Activity className="h-4 w-4" style={{ color: TONES.ai.main }} aria-hidden="true" /> Activity</p>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9db0d6' }}>Sample feed</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter the activity feed">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={flt === id} onClick={() => setFlt(id)} className="rounded-full px-2.5 py-1 text-[11px] font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={flt === id ? { background: '#e8eeff', color: '#12204a' } : { background: 'rgba(255,255,255,0.06)', color: '#c3d0ee', border: '1px solid rgba(160,180,255,0.2)' }}>{label}</button>
        ))}
      </div>
      <ul className="mt-3 flex-1 space-y-2 overflow-hidden" aria-live="off" data-no-i18n>
        {shown.map((e, i) => {
          const tone = TONES[e.tag]; const I = FEED_ICON[e.tag];
          return (
            <li key={e.id} className="site-in-right flex items-start gap-2.5 rounded-xl p-2" style={{ background: i === 0 ? tone.soft : 'rgba(255,255,255,0.03)', border: `1px solid ${i === 0 ? tone.main : 'rgba(160,180,255,0.1)'}` }}>
              <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full" style={{ background: tone.soft, color: tone.main }}><I className="h-3.5 w-3.5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-bold text-white">{e.title}</p><p className="truncate text-[11px]" style={{ color: '#b4c2e2' }}>{e.meta}</p></div>
              <span dir="ltr" className="flex-shrink-0 text-[10px] font-bold" style={{ color: '#9db0d6' }}>{AGO[i]}</span>
            </li>
          );
        })}
        {!shown.length && <li className="py-6 text-center text-xs" style={{ color: '#9db0d6' }}>Nothing here yet. Watch the animation.</li>}
      </ul>
    </div>
  );
}

const FREE = [
  { Icon: Cpu, t: 'Open-source AI', d: 'Planned to run on one school computer, with no per-use fees.' },
  { Icon: Camera, t: 'Cameras you already have', d: 'Made to work with ordinary network cameras.' },
  { Icon: Wifi, t: 'No AI subscription', d: 'Built around free tools, so there is no monthly AI bill.' },
];
const SAFE = [
  { Icon: UserCheck, t: 'People decide', d: 'AI suggests. A teacher or principal approves.' },
  { Icon: ScanFace, t: 'Parents agree first', d: 'Faces are only used for children whose parents have agreed.' },
  { Icon: Lock, t: 'Data stays at school', d: 'Planned to be processed on the school’s own computer.' },
  { Icon: ShieldCheck, t: 'Every step is logged', d: 'A trail shows who approved what, and when.' },
];

export default function AiCenter() {
  const reduced = useReducedMotion();
  const [secRef, inView] = useInView({ once: false, threshold: 0.2 });
  const [wf, setWf] = useState(0); const [step, setStep] = useState(reduced ? 5 : 0);
  const [playing, setPlaying] = useState(true); const [manual, setManual] = useState(false);
  const [feed, setFeed] = useState(() => SEED.map((e, i) => ({ ...e, id: `s${i}` }))); const [flt, setFlt] = useState('all');
  const counter = useRef(0);
  const w = WF[wf]; const Prev = w.Preview;
  const tone = TONES[w.tone[Math.min(step, 5)]];

  // the animation clock: one step every 1.5 seconds, then on to the next helper (unless the visitor picked one)
  useEffect(() => {
    if (!playing || !inView || reduced) return undefined;
    const id = setTimeout(() => {
      if (step < 5) setStep(step + 1);
      else { setStep(0); if (!manual) setWf((x) => (x + 1) % WF.length); }
    }, step === 5 ? 3400 : 1500);
    return () => clearTimeout(id);
  }, [step, wf, playing, inView, reduced, manual]);

  // new events arrive in the feed as each step completes
  useEffect(() => {
    if (reduced) { setStep(5); setFeed([...WF[wf].events.slice(1).reverse(), ...SEED].map((e, i) => ({ ...e, id: `r${wf}-${i}` }))); return; }
    const ev = WF[wf].events[step]; if (!ev || step < 1) return;
    counter.current += 1; setFeed((f) => [{ ...ev, id: `e${counter.current}` }, ...f].slice(0, 9));
  }, [wf, step, reduced]);

  const pick = (n) => { setManual(true); setWf(n); setStep(reduced ? 5 : 0); };
  const idx = Math.min(step, 4); const cur = w.nodes[idx]; const ck = KIND[cur.k]; const speech = w.robot[Math.min(step, 5)];

  return (
    <section id="ai" ref={secRef} className="relative scroll-mt-16 overflow-x-clip px-5 py-16 lg:px-8 lg:py-24" style={{ color: '#fff', background: 'radial-gradient(ellipse 60% 50% at 15% 0%, rgba(120,100,255,0.28), transparent 60%), radial-gradient(ellipse 50% 40% at 95% 25%, rgba(79,216,234,0.16), transparent 60%), #080d1c' }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(160,180,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(160,180,255,0.07) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(ellipse at 50% 30%, #000 20%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, #000 20%, transparent 75%)' }} />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'rgba(255,201,94,0.14)', color: TONES.review.main, border: '1px solid rgba(255,201,94,0.5)' }}><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Roadmap · not released yet</span>
            <SectionHead light eyebrow="AI automation · coming next" title="Teachers teach. AI does the paperwork." text="A look at where Aulensia is heading: AI helpers that draft, watch and check, while people stay in charge. These are plans, shown as working previews. They are not released yet." />
          </div>
          <div className="relative mx-auto flex w-56 flex-col items-center lg:w-full">
            <div key={`${wf}-${step}`} className="site-pop relative mb-2 rounded-2xl px-4 py-2.5 text-center text-sm font-bold" style={{ background: tone.soft, border: `1px solid ${tone.main}`, color: '#fff', transition: 'background 400ms' }} aria-live="off">
              {speech}<span aria-hidden="true" className="absolute -bottom-1.5 start-1/2 h-3 w-3 -translate-x-1/2 rotate-45" style={{ background: tone.soft, borderRight: `1px solid ${tone.main}`, borderBottom: `1px solid ${tone.main}` }} />
            </div>
            <AiRobot tone={w.tone[Math.min(step, 5)]} moving={!reduced && playing} className="h-44 w-44 lg:h-52 lg:w-52" />
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl" style={{ background: 'rgba(14,22,44,0.72)', border: '1px solid rgba(160,180,255,0.2)', boxShadow: '0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'rgba(160,180,255,0.16)' }}>
            <div className="flex items-center gap-2" aria-hidden="true"><i className="h-2.5 w-2.5 rounded-full" style={{ background: '#ff7f73' }} /><i className="h-2.5 w-2.5 rounded-full" style={{ background: '#ffc95e' }} /><i className="h-2.5 w-2.5 rounded-full" style={{ background: '#49e0a0' }} /></div>
            <p className="text-xs font-bold tracking-wider" style={{ color: '#c3d0ee', fontFamily: 'ui-monospace, Menlo, monospace' }}>AULENSIA AI · CONTROL CENTER · PREVIEW</p>
            {!reduced && <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(160,180,255,0.3)' }}>{playing ? <><Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pause animation</> : <><Play className="h-3.5 w-3.5" aria-hidden="true" /> Play animation</>}</button>}
          </div>

          <div role="tablist" aria-label="Choose an AI helper" className="grid gap-2 p-3 sm:grid-cols-3">
            {WF.map((x, n) => {
              const T = x.Icon; const on = wf === n;
              return (
                <button key={x.id} id={`ai-tab-${n}`} data-group="ai" role="tab" aria-selected={on} aria-controls="ai-panel" tabIndex={on ? 0 : -1} type="button" onClick={() => pick(n)} onKeyDown={(e) => tabKeys(e, WF.length, wf, pick)} className="flex items-start gap-3 rounded-2xl p-3 text-start transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ background: on ? 'rgba(169,155,255,0.16)' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? TONES.ai.main : 'rgba(160,180,255,0.16)'}`, boxShadow: on ? `0 0 28px ${TONES.ai.soft}` : 'none' }}>
                  <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl" style={{ background: on ? TONES.ai.soft : 'rgba(255,255,255,0.06)', color: on ? '#fff' : '#b4c2e2' }}><T className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0"><span className="block text-sm font-bold text-white">{x.title}</span><span className="mt-0.5 block text-[11px] font-bold" style={{ color: n === 0 ? TONES.done.main : TONES.review.main }}>{x.status}</span></span>
                </button>
              );
            })}
          </div>

          <div id="ai-panel" role="tabpanel" aria-labelledby={`ai-tab-${wf}`} className="grid gap-4 p-3 pt-1 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-4">
              <p className="px-1 text-[15px] leading-7" style={{ color: '#dbe6fb' }}>{w.blurb}</p>
              <Flow nodes={w.nodes} step={step} />
              <div key={`${wf}-${idx}`} className="site-pop flex items-start gap-3 rounded-2xl p-3" style={{ background: TONES[ck].soft, border: `1px solid ${TONES[ck].main}` }}>
                <span className="mt-0.5 flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.3)', color: TONES[ck].main }}>{KIND_LABEL[cur.k]}</span>
                <div><p className="text-sm font-bold text-white">{cur.t}</p><p className="mt-0.5 text-[13px] leading-5" style={{ color: '#dbe6fb' }}>{cur.d}</p></div>
                {cur.k === 'ai' && step < 5 && <span aria-hidden="true" className="ms-auto inline-flex gap-1 self-center"><i className="ai-dot h-1.5 w-1.5 rounded-full" style={{ background: TONES.ai.main }} /><i className="ai-dot h-1.5 w-1.5 rounded-full" style={{ background: TONES.ai.main, animationDelay: '150ms' }} /><i className="ai-dot h-1.5 w-1.5 rounded-full" style={{ background: TONES.ai.main, animationDelay: '300ms' }} /></span>}
              </div>
              <Prev step={step} />
              <p className="px-1 text-sm font-semibold" style={{ color: TONES.done.main }}>Why it matters: <span style={{ color: '#dbe6fb', fontWeight: 500 }}>{w.why}</span></p>
            </div>
            <Feed items={feed} flt={flt} setFlt={setFlt} />
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-4 py-3" style={{ borderColor: 'rgba(160,180,255,0.16)' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#9db0d6' }}>Colour guide</p>
            {LEGEND.map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#dbe6fb' }}><i className="h-2.5 w-2.5 rounded-full" style={{ background: TONES[k].main, boxShadow: `0 0 8px ${TONES[k].main}` }} aria-hidden="true" />{l}</span>)}
          </div>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(160,180,255,0.18)' }}>
            <h3 className="font-display text-xl font-bold">Designed to cost nothing extra</h3>
            <ul className="mt-4 space-y-3">{FREE.map(({ Icon, t, d }) => <li key={t} className="flex items-start gap-3"><span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg" style={{ background: TONES.live.soft, color: TONES.live.main }}><Icon className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-sm font-bold">{t}</p><p className="text-[13px] leading-5" style={{ color: '#c3d0ee' }}>{d}</p></div></li>)}</ul>
          </div>
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(160,180,255,0.18)' }}>
            <h3 className="font-display text-xl font-bold">People stay in charge</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">{SAFE.map(({ Icon, t, d }) => <li key={t} className="flex items-start gap-3"><span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg" style={{ background: TONES.done.soft, color: TONES.done.main }}><Icon className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-sm font-bold">{t}</p><p className="text-[13px] leading-5" style={{ color: '#c3d0ee' }}>{d}</p></div></li>)}</ul>
          </div>
        </div>

        <div className="mt-10 rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, rgba(169,155,255,0.2), rgba(79,216,234,0.14))', border: '1px solid rgba(169,155,255,0.4)' }}>
          <h3 className="font-display text-2xl font-bold">Which one should we build first?</h3>
          <p className="mx-auto mt-2 max-w-2xl text-[15px] leading-7" style={{ color: '#dbe6fb' }}>Tell us what would help your school most. Your answer helps us decide the order.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {[['Term papers', 'the term paper helper'], ['Safer classrooms', 'the safer classrooms alerts'], ['Door attendance', 'attendance at the door']].map(([l, m]) => (
              <a key={l} href={whatsappLink(`Hello Aulensia, I would like ${m} first.`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ background: '#fff', color: '#12204a' }}><FaWhatsapp className="h-4 w-4" aria-hidden="true" style={{ color: '#0f7a6a' }} /> {l} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
