import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import NetworkGlobe from './NetworkGlobe';
import ShotCrop from './ShotCrop';
import { useNarrow, useReducedMotion } from './useMotion';
import { useSite } from './SiteShell';
import { CAMPUSES, HERO_CHIPS, whatsappLink } from './siteData';

const INK = '#0f1b2d';

// A small card cut from a real screen of the demo school, floating beside the globe.
const Panel = ({ className = '', depth = 10, label, children }) => (
  <figure className={`site-parallax absolute hidden lg:block ${className}`} style={{ '--d': depth }}>
    <div className="site-float overflow-hidden rounded-xl border shadow-2xl" style={{ borderColor: 'rgba(190,210,255,0.28)', background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(3px)' }}>
      {children}
      <figcaption className="px-2.5 py-1 text-[10px] font-semibold" style={{ color: '#c4d4f3', background: 'rgba(12,24,44,0.78)' }}>{label}</figcaption>
    </div>
  </figure>
);

export default function Hero() {
  const { openAsk, jump } = useSite();
  const reduced = useReducedMotion(); const narrow = useNarrow(768);
  const [active, setActive] = useState(null);
  const root = useRef(null);

  // gentle pointer parallax on large screens with a mouse
  useEffect(() => {
    const el = root.current; if (!el || reduced || !window.matchMedia('(pointer: fine)').matches) return undefined;
    let raf = 0;
    const move = (e) => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const r = el.getBoundingClientRect(); el.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3)); el.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3)); }); };
    el.addEventListener('pointermove', move, { passive: true });
    return () => { el.removeEventListener('pointermove', move); if (raf) cancelAnimationFrame(raf); };
  }, [reduced]);

  return (
    <section id="top" ref={root} className="relative overflow-hidden px-5 pb-10 pt-10 sm:pt-14 lg:px-8 lg:pb-16"
      style={{ background: `radial-gradient(ellipse 70% 60% at 72% 38%, #1d3c78 0%, ${INK} 62%, #0a1322 100%)`, color: '#fff' }}>
      {/* soft stars */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(1px 1px at 12% 18%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 36% 72%, #cfe0ff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 58% 12%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 84% 64%, #cfe0ff 50%, transparent 51%), radial-gradient(1px 1px at 92% 20%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 22% 90%, #fff 50%, transparent 51%)' }} />
      <div className="relative mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: '#f0a58c' }}>The connected school workspace, built in Pakistan</p>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.6rem]">
            Every part of education. <span className="site-sweep-text bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg,#8fb9ff,#ffd2bf,#8fe3d2,#8fb9ff)' }}>Connected.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8" style={{ color: '#c9d6ea' }}>
            Admissions, classrooms, attendance, fees, staff and families work together in one simple place. Teachers teach, parents stay informed and leaders see the whole picture, in English and Urdu.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => jump('platform')} className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ background: '#fff', color: '#12294e' }}>
              Explore Aulensia <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => jump('how')} className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 font-semibold transition hover:bg-white/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ borderColor: 'rgba(200,215,245,0.5)', color: '#fff' }}>
              <Play className="h-4 w-4" aria-hidden="true" /> See How It Works
            </button>
            <button type="button" onClick={() => openAsk('demo')} className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50" style={{ background: '#e0896f', color: '#1b2837' }}>
              Request a Demo
            </button>
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" style={{ color: '#c9d6ea' }}>
            <button type="button" onClick={() => jump('demo')} className="font-semibold underline underline-offset-4 hover:text-white">Try the live demo school</button>
            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-4 hover:text-white"><FaWhatsapp className="h-4 w-4" aria-hidden="true" /> Chat on WhatsApp</a>
          </p>
          <ul className="mt-7 flex flex-wrap gap-2">
            {HERO_CHIPS.map((c) => (<li key={c} className="rounded-lg border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: 'rgba(200,215,245,0.28)', color: '#dbe6fb', background: 'rgba(255,255,255,0.05)' }}>{c}</li>))}
          </ul>
        </div>

        <div className="relative">
          <div className="relative mx-auto aspect-square w-full max-w-[640px] min-h-[320px]" style={{ height: narrow ? 340 : undefined }}>
            <NetworkGlobe activeId={active} onActive={setActive} reduced={reduced} compact={narrow}
              label="A turning globe. Example campuses (a school, a nursery, a college, an academy, a second campus, school transport and a group head office) are joined by glowing lines, showing how Aulensia connects different places." />
            <Panel className="left-[-6%] top-[6%]" depth={14} label="Fees · from the demo school">
              <ShotCrop shot="admin-overview" x={60} y={380} w={560} h={230} scale={0.5} label="Fee collection card from the demo school" />
            </Panel>
            <Panel className="right-[-8%] top-[12%] site-float-b" depth={-12} label="Parent portal · demo school">
              <ShotCrop shot="parent-home" x={340} y={575} w={680} h={215} scale={0.42} label="A child's attendance for the last seven days" />
            </Panel>
            <Panel className="left-[-4%] bottom-[8%] site-float-c" depth={-10} label="Attendance · demo school">
              <ShotCrop shot="admin-attendance" x={40} y={442} w={632} h={235} scale={0.44} label="A class card with a Take attendance button" />
            </Panel>
            <Panel className="right-[-6%] bottom-[4%]" depth={12} label="Notices · demo school">
              <ShotCrop shot="admin-notices" x={688} y={288} w={632} h={175} scale={0.44} label="A school notice" />
            </Panel>
          </div>
          <div className="relative z-10 mt-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#9fb6dc' }}>Touch a campus to see what it shares</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label="Example campuses">
              {CAMPUSES.map((c) => (
                <button key={c.id} type="button" aria-pressed={active === c.id} onClick={() => setActive(active === c.id ? null : c.id)}
                  className="rounded-full border px-3 py-1.5 text-xs font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
                  style={active === c.id ? { background: '#fff', color: '#12294e', borderColor: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: '#dbe6fb', borderColor: 'rgba(200,215,245,0.3)' }}>{c.short}</button>
              ))}
            </div>
            <p className="mx-auto mt-3 min-h-[2.5rem] max-w-md text-sm" style={{ color: '#c9d6ea' }} aria-live="polite">
              {active ? `${CAMPUSES.find((c) => c.id === active).label}: ${CAMPUSES.find((c) => c.id === active).flows.join(', ')}.` : 'The places on the globe are examples of how different institutions link up through one platform.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
