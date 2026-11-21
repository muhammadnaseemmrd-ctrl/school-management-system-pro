import React, { useCallback, useEffect, useRef } from 'react';
import { CAMPUSES, CAMPUS_LINKS } from './siteData';

// A connected-campus globe drawn on a canvas with no extra library. Dots make the sphere, arcs link the example campuses,
// and small lights travel along the arcs. Drag to turn it; hover or tap a campus to see what it shares. Everything here is
// an illustration of how Aulensia links different places, not a map of customers.
const TAU = Math.PI * 2;
const rad = (d) => (d * Math.PI) / 180;
const vec = (lat, lon) => { const a = rad(lat); const o = rad(lon); return [Math.cos(a) * Math.sin(o), Math.sin(a), Math.cos(a) * Math.cos(o)]; };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const shortest = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

function sphereDots(n) {
  const out = []; const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i += 1) { const y = 1 - (i / (n - 1)) * 2; const r = Math.sqrt(1 - y * y); const t = g * i; out.push([Math.cos(t) * r, y, Math.sin(t) * r, 0.55 + 0.45 * Math.abs(Math.sin(i * 12.9898) * Math.cos(i * 4.1414))]); }
  return out;
}
function arcPoints(a, b, steps = 40) {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])); const om = Math.acos(dot) || 0.001; const s = Math.sin(om); const lift = 0.14 + 0.2 * (om / Math.PI);
  const pts = [];
  for (let i = 0; i <= steps; i += 1) { const t = i / steps; const k1 = Math.sin((1 - t) * om) / s; const k2 = Math.sin(t * om) / s; const h = 1 + lift * Math.sin(Math.PI * t); pts.push([(a[0] * k1 + b[0] * k2) * h, (a[1] * k1 + b[1] * k2) * h, (a[2] * k1 + b[2] * k2) * h]); }
  return pts;
}

export default function NetworkGlobe({ activeId, onActive, reduced = false, compact = false, label }) {
  const wrap = useRef(null); const canvas = useRef(null); const tip = useRef(null);
  const st = useRef({ rot: rad(-60), tilt: rad(-18), vel: 0, target: null, hover: null, drag: null, w: 0, h: 0, dpr: 1, visible: true, raf: 0, last: 0, t: 0, projected: [], tipId: null });
  const world = useRef(null);
  const props = useRef({ activeId, onActive, reduced });
  props.current = { activeId, onActive, reduced };

  if (!world.current) {
    const nodes = CAMPUSES.map((c) => ({ ...c, v: norm(vec(c.lat, c.lon)) }));
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const arcs = CAMPUS_LINKS.map(([a, b], i) => ({ pts: arcPoints(byId[a].v, byId[b].v), parts: [{ t: (i * 0.173) % 1, sp: 0.0021 + (i % 3) * 0.0006 }, { t: (i * 0.173 + 0.5) % 1, sp: 0.0021 + (i % 3) * 0.0006 }] }));
    world.current = { nodes, byId, arcs, dots: sphereDots(compact ? 420 : 820) };
  }

  const project = useCallback((v, R, cx, cy, s) => {
    const cr = Math.cos(s.rot); const sr = Math.sin(s.rot); const ct = Math.cos(s.tilt); const stl = Math.sin(s.tilt);
    const x1 = v[0] * cr + v[2] * sr; const z1 = -v[0] * sr + v[2] * cr;
    const y2 = v[1] * ct - z1 * stl; const z2 = v[1] * stl + z1 * ct;
    const k = 1 + z2 * 0.06;
    return [cx + x1 * R * k, cy - y2 * R * k, z2];
  }, []);

  const draw = useCallback(() => {
    const cv = canvas.current; if (!cv) return;
    const s = st.current; const ctx = cv.getContext('2d'); if (!ctx || !s.w) return;
    const { w, h, dpr } = s; const cx = w / 2; const cy = h / 2; const R = Math.min(w, h) * 0.34; const { nodes, arcs, dots } = world.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    // soft glow behind the globe
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.7); g.addColorStop(0, 'rgba(90,140,230,0.34)'); g.addColorStop(0.55, 'rgba(60,100,190,0.10)'); g.addColorStop(1, 'rgba(20,40,90,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // faint disc so the back of the globe reads as glass
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = 'rgba(40,80,160,0.10)'; ctx.fill(); ctx.strokeStyle = 'rgba(150,185,240,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    // dots
    const ds = compact ? 1.5 : 1.7;
    for (let i = 0; i < dots.length; i += 1) {
      const d = dots[i]; const p = project(d, R, cx, cy, s); const depth = (p[2] + 1) / 2;
      ctx.globalAlpha = (0.12 + 0.78 * depth) * (0.45 + 0.55 * d[3]); ctx.fillStyle = p[2] > 0 ? '#bcd3ff' : '#6f93cb';
      ctx.fillRect(p[0] - ds / 2, p[1] - ds / 2, ds, ds);
    }
    ctx.globalAlpha = 1;
    // orbit rings with small satellites (the modules around a campus)
    for (let r = 0; r < 2; r += 1) {
      const rr = r === 0 ? 1.34 : 1.52; const tiltZ = r === 0 ? 0.42 : -0.3; const spin = s.t * (r === 0 ? 0.0004 : -0.0003);
      const pts = []; for (let i = 0; i <= 90; i += 1) { const a = (i / 90) * TAU; const x = Math.cos(a) * rr; const z = Math.sin(a) * rr; const xr = x * Math.cos(tiltZ); const yr = x * Math.sin(tiltZ); pts.push(project([xr, yr, z], R, cx, cy, { ...s, rot: s.rot * 0.4 })); }
      ctx.lineWidth = 1; for (let i = 0; i < pts.length - 1; i += 1) { ctx.strokeStyle = `rgba(160,195,255,${pts[i][2] > 0 ? 0.28 : 0.09})`; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke(); }
      for (let k = 0; k < 2; k += 1) { const a = spin + k * Math.PI + r; const x = Math.cos(a) * rr; const z = Math.sin(a) * rr; const p = project([x * Math.cos(tiltZ), x * Math.sin(tiltZ), z], R, cx, cy, { ...s, rot: s.rot * 0.4 }); ctx.globalAlpha = p[2] > 0 ? 0.95 : 0.35; ctx.fillStyle = r === 0 ? '#d9826a' : '#7fd0c2'; ctx.beginPath(); ctx.arc(p[0], p[1], p[2] > 0 ? 3.2 : 2.2, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // arcs and the lights that travel along them
    arcs.forEach((a) => {
      const pp = a.pts.map((v) => project(v, R, cx, cy, s));
      for (let i = 0; i < pp.length - 1; i += 1) { const zz = (pp[i][2] + pp[i + 1][2]) / 2; ctx.strokeStyle = `rgba(143,185,255,${zz > -0.05 ? 0.5 : 0.1})`; ctx.lineWidth = zz > -0.05 ? 1.2 : 0.8; ctx.beginPath(); ctx.moveTo(pp[i][0], pp[i][1]); ctx.lineTo(pp[i + 1][0], pp[i + 1][1]); ctx.stroke(); }
      a.parts.forEach((q) => {
        const f = q.t * (pp.length - 1); const i0 = Math.min(pp.length - 2, Math.floor(f)); const fr = f - i0; const x = pp[i0][0] + (pp[i0 + 1][0] - pp[i0][0]) * fr; const y = pp[i0][1] + (pp[i0 + 1][1] - pp[i0][1]) * fr; const z = pp[i0][2];
        const al = z > -0.1 ? 1 : 0.25; const gr = ctx.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, `rgba(255,236,200,${0.95 * al})`); gr.addColorStop(1, 'rgba(255,200,150,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
      });
    });
    // campuses
    s.projected = nodes.map((n) => ({ id: n.id, p: project(n.v, R, cx, cy, s) }));
    const sel = props.current.activeId || s.hover;
    s.projected.forEach(({ id, p }) => {
      const front = p[2] > -0.05; const on = sel === id; const pulse = props.current.reduced ? 0 : (Math.sin(s.t * 0.004 + id.length) + 1) / 2;
      ctx.globalAlpha = front ? 1 : 0.3;
      ctx.beginPath(); ctx.arc(p[0], p[1], (on ? 15 : 10) + pulse * 4, 0, TAU); ctx.strokeStyle = on ? 'rgba(255,214,170,0.95)' : 'rgba(255,186,150,0.45)'; ctx.lineWidth = on ? 2 : 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], on ? 6.5 : 5, 0, TAU); ctx.fillStyle = on ? '#fff3e6' : '#f1a58a'; ctx.fill();
    });
    ctx.globalAlpha = 1;
    // tooltip follows the chosen campus
    const t = tip.current; const hit = s.projected.find((q) => q.id === sel);
    if (t) {
      if (hit && hit.p[2] > -0.05) { t.style.opacity = '1'; t.style.transform = `translate(${Math.round(Math.min(Math.max(hit.p[0] + 16, 8), w - 232))}px, ${Math.round(Math.min(Math.max(hit.p[1] - 18, 8), h - 130))}px)`; if (s.tipId !== sel) { s.tipId = sel; const n = world.current.byId[sel]; t.querySelector('[data-title]').textContent = n.label; t.querySelector('[data-list]').innerHTML = n.flows.map((f) => `<li>${f}</li>`).join(''); } } else { t.style.opacity = '0'; }
    }
  }, [project, compact]);

  // size and pixel ratio
  useEffect(() => {
    const el = wrap.current; const cv = canvas.current; if (!el || !cv) return undefined;
    const fit = () => { const r = el.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2); const s = st.current; s.w = Math.max(200, Math.round(r.width)); s.h = Math.max(200, Math.round(r.height)); s.dpr = dpr; cv.width = Math.round(s.w * dpr); cv.height = Math.round(s.h * dpr); cv.style.width = `${s.w}px`; cv.style.height = `${s.h}px`; draw(); };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null; ro && ro.observe(el);
    window.addEventListener('resize', fit);
    return () => { ro && ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [draw, compact]);

  // the loop runs only while the globe is on screen and the page is in front
  useEffect(() => {
    const s = st.current; const el = wrap.current;
    const step = (now) => {
      s.raf = 0; if (!s.visible || document.hidden || props.current.reduced) return;
      const dt = s.last ? Math.min(48, now - s.last) : 16; s.last = now; s.t += dt;
      if (s.target !== null) { const d = shortest(s.rot, s.target); if (Math.abs(d) < 0.004) { s.rot = s.target; s.target = null; } else s.rot += d * Math.min(1, dt * 0.006); }
      else if (!s.drag) { s.rot += s.vel; s.vel *= 0.95; if (Math.abs(s.vel) < 0.0004) s.vel = 0; if (!(props.current.activeId || s.hover)) s.rot += 0.0016 * (dt / 16); }
      for (const a of world.current.arcs) for (const q of a.parts) { q.t += q.sp * (dt / 16); if (q.t > 1) q.t -= 1; }
      draw(); s.raf = requestAnimationFrame(step);
    };
    const kick = () => { if (!s.raf && !props.current.reduced) { s.last = 0; s.raf = requestAnimationFrame(step); } };
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; if (s.visible) kick(); }, { threshold: 0.05 }) : null; io && el && io.observe(el);
    const vis = () => { if (!document.hidden) kick(); }; document.addEventListener('visibilitychange', vis);
    kick();
    return () => { io && io.disconnect(); document.removeEventListener('visibilitychange', vis); if (s.raf) cancelAnimationFrame(s.raf); s.raf = 0; };
  }, [draw, reduced]);

  // turn to the campus chosen from outside
  useEffect(() => {
    const s = st.current; const n = activeId ? world.current.byId[activeId] : null;
    if (n) { s.target = -rad(n.lon); if (props.current.reduced) { s.rot = s.target; s.target = null; draw(); } }
  }, [activeId, draw]);

  const where = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const nearest = (x, y) => { let best = null; let bd = 26; st.current.projected.forEach((q) => { if (q.p[2] < -0.05) return; const d = Math.hypot(q.p[0] - x, q.p[1] - y); if (d < bd) { bd = d; best = q.id; } }); return best; };
  const onMove = (e) => {
    const s = st.current; const [x, y] = where(e);
    if (s.drag) { const dx = x - s.drag.x; s.drag.moved += Math.abs(dx); s.rot += dx * 0.006; s.vel = dx * 0.0016; s.drag.x = x; s.target = null; if (props.current.reduced) draw(); return; }
    const h = nearest(x, y); if (h !== s.hover) { s.hover = h; canvas.current.style.cursor = h ? 'pointer' : 'grab'; if (props.current.reduced) draw(); }
  };
  const onDown = (e) => { const [x, y] = where(e); st.current.drag = { x, moved: 0, x0: x, y0: y }; try { canvas.current.setPointerCapture(e.pointerId); } catch { /* not needed */ } };
  const onUp = (e) => {
    const s = st.current; const d = s.drag; s.drag = null; if (!d) return;
    if (d.moved < 6) { const [x, y] = where(e); const h = nearest(x, y); props.current.onActive && props.current.onActive(h === props.current.activeId ? null : h); if (props.current.reduced) draw(); }
  };
  const onLeave = () => { st.current.hover = null; if (props.current.reduced) draw(); };

  return (
    <div ref={wrap} className="relative h-full w-full select-none">
      <canvas ref={canvas} role="img" aria-label={label || 'A turning globe with example campuses joined by glowing lines'} onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onLeave} onPointerCancel={onLeave} className="block h-full w-full cursor-grab touch-pan-y" />
      <div ref={tip} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 w-[216px] rounded-xl border p-3 text-left opacity-0 transition-opacity duration-200"
        style={{ background: 'rgba(12,24,44,0.88)', borderColor: 'rgba(160,195,255,0.35)', color: '#e8efff', backdropFilter: 'blur(6px)' }}>
        <p data-title className="text-[13px] font-bold" />
        <ul data-list className="mt-1.5 space-y-1 text-[12px] leading-4" style={{ color: '#c4d4f3' }} />
        <p className="mt-2 text-[10px]" style={{ color: '#8fa6d0' }}>Example only</p>
      </div>
    </div>
  );
}
