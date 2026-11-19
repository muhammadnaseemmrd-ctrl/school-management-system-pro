import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignLeft, AlignRight, AlignStartHorizontal, AlignStartVertical, AlertTriangle, ArrowDownToLine, ArrowUpToLine, Barcode as BarcodeIcon, Check, Copy, Eye, EyeOff, FileText, Image as ImageIcon, Lock, Minus, QrCode, Redo2, Save, Square, Table2, Trash2, Type, Undo2, Unlock, ZoomIn, ZoomOut } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Field, Pill, btnGhost, btnPrimary, errMsg, inputCls } from '../ui';
import { SideView, paperDims, blobUrl, PX_PER_MM, DEFAULT_THEME, color } from './layoutKit';

// The design canvas (PRD E12): drag, resize, snap, nudge, align, undo, plus a live report from the server's checks.
const uid = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const SNAP = 1.5; const round = (n) => Math.round(n * 100) / 100;
const FONT_OPTS = [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Monospace']];
const THEME_KEYS = [['primary', 'Main colour'], ['accent', 'Accent'], ['ink', 'Text'], ['paper', 'Paper'], ['soft', 'Soft fill']];
const COLOR_TOKENS = ['theme.primary', 'theme.accent', 'theme.ink', 'theme.paper', 'theme.soft', '#FFFFFF', '#000000'];
const NEW = {
  text: () => ({ type: 'text', name: 'Text', x: 10, y: 10, w: 50, h: 8, text: 'New text', font: 'sans', size: 11, color: 'theme.ink', valign: 'middle', fit: 'shrink' }),
  rect: () => ({ type: 'rect', name: 'Box', x: 10, y: 10, w: 40, h: 20, fill: 'theme.soft' }),
  line: () => ({ type: 'line', name: 'Line', x: 10, y: 20, w: 60, h: 0, stroke: 'theme.ink', strokeW: 0.3 }),
  imageField: () => ({ type: 'image', source: 'field', name: 'Picture', x: 10, y: 10, w: 20, h: 20, field: 'school.logo', fit: 'contain', alt: 'School logo' }),
  qr: () => ({ type: 'qr', name: 'Check code', x: 10, y: 10, w: 18, h: 18, value: '{{doc.verifyUrl}}', alt: 'Scan to check this document' }),
  barcode: () => ({ type: 'barcode', name: 'Barcode', x: 10, y: 10, w: 40, h: 10, value: '{{doc.serial}}', alt: 'Document number as a barcode' }),
  table: () => ({ type: 'table', name: 'Subject table', x: 10, y: 60, w: 120, h: 60, columns: [{ title: 'Subject', w: 5 }, { title: 'Marks', w: 2, align: 'right' }, { title: 'Out of', w: 2, align: 'right' }, { title: 'Grade', w: 1.5, align: 'center' }], rowH: 7, size: 9, header: 'theme.primary' }),
};
const TYPE_ICON = { text: Type, rect: Square, line: Minus, image: ImageIcon, qr: QrCode, barcode: BarcodeIcon, table: Table2 };

const Num = ({ label, value, onChange, step = 0.5, min, max }) => (
  <label className="block"><span className="mb-0.5 block text-[11px] font-semibold text-[#3b4a5c]">{label}</span>
    <input type="number" className={`${inputCls} !py-1.5`} value={value ?? ''} step={step} min={min} max={max} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></label>
);
const ColorPick = ({ label, value, onChange, theme }) => {
  const shown = color(value, theme);
  return (
    <div><span className="mb-0.5 block text-[11px] font-semibold text-[#3b4a5c]">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="h-7 w-7 shrink-0 rounded border border-[#cbd5d5]" style={{ background: shown || 'repeating-linear-gradient(45deg,#fff,#fff 3px,#ddd 3px,#ddd 6px)' }} aria-hidden="true" />
        <select className={`${inputCls} !py-1.5`} value={COLOR_TOKENS.includes(value) ? value : value ? 'custom' : ''} onChange={(e) => onChange(e.target.value === 'custom' ? '#888888' : e.target.value)} aria-label={label}>
          <option value="">None</option>{COLOR_TOKENS.map((c) => <option key={c} value={c}>{c.startsWith('theme.') ? `Theme: ${c.slice(6)}` : c === '#FFFFFF' ? 'White' : 'Black'}</option>)}<option value="custom">Custom…</option>
        </select>
        {value && !COLOR_TOKENS.includes(value) && <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#888888'} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label} custom colour`} className="h-8 w-9 cursor-pointer rounded border border-[#e3e7e7]" />}
      </div>
    </div>
  );
};

export default function CanvasEditor({ template, version, assets, family, onSaved, onClose, readOnly }) {
  const catalogSamples = useMemo(() => Object.fromEntries(Object.entries(family?.fields || {}).map(([k, f]) => [k, f.sample])), [family]);
  const [doc, setDoc] = useState(() => ({ layout: clone(version.layout), theme: { ...DEFAULT_THEME, ...(version.theme || {}) }, locales: version.locales?.length ? version.locales : ['en'] }));
  const hist = useRef({ past: [], future: [] }); const [, bump] = useState(0);
  const [sel, setSel] = useState([]); const [side, setSide] = useState(0); const [zoom, setZoom] = useState(0); const [locale, setLocale] = useState('en'); const [guides, setGuides] = useState([]);
  const [report, setReport] = useState(version.report || null); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [proof, setProof] = useState(null); const [tab, setTab] = useState('props');
  const [urdu, setUrdu] = useState({}); const wrapRef = useRef(null); const [wrapW, setWrapW] = useState(700);
  const sideObj = doc.layout.sides[side] || doc.layout.sides[0]; const layers = sideObj.layers; const [pw, ph] = paperDims(doc.layout.paper); const bleed = doc.layout.paper.bleedMm || 0; const safe = doc.layout.paper.safeMm || 0;
  const ro = !!readOnly;
  const fitW = (wrapW - 32) / (pw + 2 * bleed); const fitH = ((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.74) / (ph + 2 * bleed); const fit = Math.max(1, Math.min(8, Math.min(fitW, fitH > 2.5 ? fitH : fitW))); const scale = zoom ? zoom : fit;
  useEffect(() => { apiClient.get('/studio/catalog').then((r) => setUrdu(r.data.urduSample || {})).catch(() => {}); }, []);
  useEffect(() => { const el = wrapRef.current; if (!el || typeof ResizeObserver === 'undefined') return undefined; const o = new ResizeObserver(() => setWrapW(el.clientWidth)); o.observe(el); setWrapW(el.clientWidth); return () => o.disconnect(); }, []);
  const values = useMemo(() => (locale === 'ur' ? { ...catalogSamples, ...urdu } : catalogSamples), [catalogSamples, urdu, locale]);
  const images = useMemo(() => Object.fromEntries((assets || []).map((a) => [`asset:${a._id}`, a.url])), [assets]);

  // history: every change is one step, typing in a box merges into one step per second
  const commit = useCallback((fn, merge) => {
    setDoc((d) => { const n = clone(d); fn(n); const h = hist.current; const now = Date.now(); if (!(merge && h.mergeKey === merge && now - h.mergeAt < 900)) { h.past.push(JSON.stringify(d)); if (h.past.length > 80) h.past.shift(); } h.mergeKey = merge || null; h.mergeAt = now; h.future = []; return n; });
    setDirty(true); bump((x) => x + 1);
  }, []);
  const undo = () => { const h = hist.current; if (!h.past.length) return; setDoc((d) => { h.future.push(JSON.stringify(d)); return JSON.parse(h.past.pop()); }); setDirty(true); bump((x) => x + 1); };
  const redo = () => { const h = hist.current; if (!h.future.length) return; setDoc((d) => { h.past.push(JSON.stringify(d)); return JSON.parse(h.future.pop()); }); setDirty(true); bump((x) => x + 1); };
  const patchLayers = (ids, fn, merge) => commit((d) => { d.layout.sides[side].layers.forEach((l) => { if (ids.includes(l.id)) fn(l); }); }, merge);
  const selLayers = layers.filter((l) => sel.includes(l.id)); const one = selLayers.length === 1 ? selLayers[0] : null;

  // live checks from the server, shortly after each change
  useEffect(() => {
    if (!dirty) return undefined;
    const h = setTimeout(() => apiClient.post('/studio/validate', { family: template.family, layout: doc.layout, theme: doc.theme }).then((r) => setReport(r.data.report)).catch(() => {}), 700);
    return () => clearTimeout(h);
  }, [doc, dirty, template.family]);

  const add = (kind, extra) => {
    if (ro) return; const base = NEW[kind](); const l = { id: uid(), ...base, ...extra };
    commit((d) => { d.layout.sides[side].layers.push(l); }); setSel([l.id]);
  };
  const remove = () => { if (ro || !sel.length) return; const ids = sel.filter((id) => !layers.find((l) => l.id === id)?.locked); commit((d) => { d.layout.sides[side].layers = d.layout.sides[side].layers.filter((l) => !ids.includes(l.id)); }); setSel([]); };
  const duplicate = () => { if (ro || !selLayers.length) return; const copies = selLayers.map((l) => ({ ...clone(l), id: uid(), name: `${l.name || l.type} copy`, x: l.x + 3, y: l.y + 3, locked: false })); commit((d) => { d.layout.sides[side].layers.push(...copies); }); setSel(copies.map((c) => c.id)); };
  const order = (dir) => { if (ro || !sel.length) return; commit((d) => { const a = d.layout.sides[side].layers; const picked = a.filter((l) => sel.includes(l.id)); const rest = a.filter((l) => !sel.includes(l.id)); d.layout.sides[side].layers = dir === 'front' ? [...rest, ...picked] : dir === 'back' ? [...picked, ...rest] : (() => { const out = [...a]; (dir === 'up' ? [...picked].reverse() : picked).forEach((p) => { const i = out.findIndex((x) => x.id === p.id); const j = dir === 'up' ? i + 1 : i - 1; if (j >= 0 && j < out.length && !sel.includes(out[j].id)) { [out[i], out[j]] = [out[j], out[i]]; } }); return out; })(); }); };

  const align = (how) => {
    if (ro || !selLayers.length) return; const mine = selLayers.filter((l) => !l.locked);
    const box = selLayers.length > 1 ? { x1: Math.min(...selLayers.map((l) => l.x)), y1: Math.min(...selLayers.map((l) => l.y)), x2: Math.max(...selLayers.map((l) => l.x + l.w)), y2: Math.max(...selLayers.map((l) => l.y + l.h)) } : { x1: 0, y1: 0, x2: pw, y2: ph };
    patchLayers(mine.map((l) => l.id), (l) => {
      if (how === 'left') l.x = box.x1; if (how === 'right') l.x = round(box.x2 - l.w); if (how === 'hcenter') l.x = round((box.x1 + box.x2) / 2 - l.w / 2);
      if (how === 'top') l.y = box.y1; if (how === 'bottom') l.y = round(box.y2 - l.h); if (how === 'vcenter') l.y = round((box.y1 + box.y2) / 2 - l.h / 2);
    });
  };

  // ── pointer: move and resize with snapping ──
  const drag = useRef(null);
  const snapTargets = (skip) => { const xs = [0, pw, pw / 2, safe, pw - safe]; const ys = [0, ph, ph / 2, safe, ph - safe]; layers.forEach((l) => { if (skip.includes(l.id) || l.hidden) return; xs.push(l.x, l.x + l.w, l.x + l.w / 2); ys.push(l.y, l.y + l.h, l.y + l.h / 2); }); return { xs, ys }; };
  const best = (vals, targets) => { let b = null; for (const v of vals) for (const t of targets) { const d = t - v; if (Math.abs(d) <= SNAP && (b === null || Math.abs(d) < Math.abs(b.d))) b = { d, at: t }; } return b; };
  const startDrag = (e, l, mode) => {
    if (ro || e.button > 0) return; e.stopPropagation(); e.preventDefault();
    let ids = sel.includes(l.id) ? sel : [l.id]; if (e.shiftKey) { ids = sel.includes(l.id) ? sel.filter((x) => x !== l.id) : [...sel, l.id]; setSel(ids); if (!ids.includes(l.id)) return; } else setSel(ids);
    const moving = layers.filter((x) => ids.includes(x.id) && !x.locked); if (!moving.length) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: moving.map((x) => ({ id: x.id, x: x.x, y: x.y, w: x.w, h: x.h })), targets: snapTargets(ids), moved: false, rect: { id: l.id, x: l.x, y: l.y, w: l.w, h: l.h } };
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return; const dx = (e.clientX - d.sx) / scale; const dy = (e.clientY - d.sy) / scale; if (!d.moved && Math.hypot(dx, dy) * scale < 3) return; d.moved = true;
    const g = []; const next = {};
    if (d.mode === 'move') {
      const bx1 = Math.min(...d.orig.map((o) => o.x)) + dx; const by1 = Math.min(...d.orig.map((o) => o.y)) + dy; const bx2 = Math.max(...d.orig.map((o) => o.x + o.w)) + dx; const by2 = Math.max(...d.orig.map((o) => o.y + o.h)) + dy;
      let ax = 0; let ay = 0; if (!e.altKey) { const sx = best([bx1, bx2, (bx1 + bx2) / 2], d.targets.xs); const sy = best([by1, by2, (by1 + by2) / 2], d.targets.ys); if (sx) { ax = sx.d; g.push({ v: sx.at }); } if (sy) { ay = sy.d; g.push({ h: sy.at }); } }
      d.orig.forEach((o) => { next[o.id] = { x: round(o.x + dx + ax), y: round(o.y + dy + ay) }; });
    } else {
      const o = d.orig[0]; let x1 = o.x; let y1 = o.y; let x2 = o.x + o.w; let y2 = o.y + o.h; const m = d.mode;
      if (m.includes('e')) x2 += dx; if (m.includes('w')) x1 += dx; if (m.includes('s')) y2 += dy; if (m.includes('n')) y1 += dy;
      if (!e.altKey) { if (m.includes('e')) { const s = best([x2], d.targets.xs); if (s) { x2 += s.d; g.push({ v: s.at }); } } if (m.includes('w')) { const s = best([x1], d.targets.xs); if (s) { x1 += s.d; g.push({ v: s.at }); } } if (m.includes('s')) { const s = best([y2], d.targets.ys); if (s) { y2 += s.d; g.push({ h: s.at }); } } if (m.includes('n')) { const s = best([y1], d.targets.ys); if (s) { y1 += s.d; g.push({ h: s.at }); } } }
      const lt = layers.find((x) => x.id === o.id); const flat = lt?.type === 'line';
      next[o.id] = { x: round(Math.min(x1, x2 - 0.5)), y: flat ? o.y : round(Math.min(y1, y2 - 0.5)), w: round(Math.max(0.5, x2 - x1)), h: flat ? 0 : round(Math.max(0.5, y2 - y1)) };
    }
    setGuides(g);
    setDoc((cur) => { const n = clone(cur); n.layout.sides[side].layers.forEach((l) => { if (next[l.id]) Object.assign(l, next[l.id]); }); return n; });
    d.dirty = true;
  };
  const endDrag = () => { const d = drag.current; drag.current = null; setGuides([]); if (d?.moved) { setDirty(true); const h = hist.current; h.past.push(JSON.stringify({ ...doc, layout: { ...doc.layout, sides: doc.layout.sides.map((s, i) => (i === side ? { ...s, layers: s.layers.map((l) => { const o = d.orig.find((x) => x.id === l.id); return o ? { ...l, x: o.x, y: o.y, w: o.w, h: o.h } : l; }) } : s)) } })); if (h.past.length > 80) h.past.shift(); h.future = []; h.mergeKey = null; bump((x) => x + 1); } };

  const onKey = (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; const k = e.key; const mod = e.ctrlKey || e.metaKey;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; } if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; } if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setSel(layers.map((l) => l.id)); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); remove(); return; } if (k === 'Escape') { setSel([]); return; }
    if (k === ']') { order(e.shiftKey ? 'front' : 'up'); return; } if (k === '[') { order(e.shiftKey ? 'back' : 'down'); return; }
    if (k === 'Tab') { e.preventDefault(); const vis = layers.filter((l) => !l.hidden); if (!vis.length) return; const i = vis.findIndex((l) => l.id === sel[0]); setSel([vis[(i + (e.shiftKey ? -1 : 1) + vis.length) % vis.length].id]); return; }
    const step = e.shiftKey ? 5 : 0.5; const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
    if (mv && sel.length && !ro) { e.preventDefault(); patchLayers(sel.filter((id) => !layers.find((l) => l.id === id)?.locked), (l) => { l.x = round(l.x + mv[0]); l.y = round(l.y + mv[1]); }, `nudge${sel.join()}`); }
  };

  const save = async (quiet) => {
    setSaving(true);
    try { const r = await apiClient.put(`/studio/templates/${template._id}/versions/${version._id}`, { layout: doc.layout, theme: doc.theme, locales: doc.locales }); setReport(r.data.version.report); setDirty(false); if (!quiet) toast.success('Draft saved'); onSaved?.(r.data.version); return true; }
    catch (e) { toast.error(errMsg(e)); return false; } finally { setSaving(false); }
  };
  const makeProof = async () => {
    if (!ro && dirty && !(await save(true))) return;
    try { if (proof?.url) URL.revokeObjectURL(proof.url); setProof(await blobUrl(apiClient, `/studio/templates/${template._id}/versions/${version._id}/proof?locale=${locale}`)); setTab('proof'); } catch (e) { toast.error('Could not make the proof PDF.'); }
  };
  useEffect(() => () => { if (proof?.url) URL.revokeObjectURL(proof.url); }, []); // eslint-disable-line
  useEffect(() => { const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);

  const upd = (k, v, merge) => patchLayers(sel, (l) => { if (v === undefined) delete l[k]; else l[k] = v; }, merge ? `${k}${sel.join()}` : undefined);
  const fieldOptions = useMemo(() => Object.entries(family?.fields || {}).filter(([, f]) => f.type !== 'rows'), [family]);
  const imageFields = useMemo(() => Object.entries(family?.fields || {}).filter(([, f]) => f.type === 'image'), [family]);
  const problems = report ? [...(report.errors || []).map((x) => ({ ...x, kind: 'error' })), ...(report.warnings || []).map((x) => ({ ...x, kind: 'warning' }))] : [];
  const lowContrast = (report?.contrast || []).filter((c) => !c.ok);
  const sideBtn = (i, label) => <button key={i} type="button" onClick={() => { setSide(i); setSel([]); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${side === i ? 'bg-[#2a5cac] text-white' : 'border border-[#e3e7e7] bg-white text-[#1b2837]'}`}>{label}</button>;
  const tb = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e3e7e7] bg-white text-[#1b2837] hover:bg-[#f7f6f2] disabled:opacity-40';

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKey}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e7e7] bg-white p-2">
        <div className="flex items-center gap-1 pe-2">{doc.layout.sides.map((s, i) => sideBtn(i, i === 0 ? 'Front' : 'Back'))}
          {!ro && doc.layout.sides.length < 2 && <button type="button" className="rounded-md border border-dashed border-[#9aa8a8] px-2 py-1.5 text-xs" onClick={() => { commit((d) => { d.layout.sides.push({ key: 'back', background: 'theme.paper', layers: [] }); }); setSide(1); }}>+ Back side</button>}</div>
        {!ro && <div className="flex items-center gap-1 border-s border-[#e3e7e7] ps-2">
          <button type="button" className={tb} title="Add text" aria-label="Add text" onClick={() => add('text')}><Type size={15} /></button>
          <button type="button" className={tb} title="Add box" aria-label="Add box" onClick={() => add('rect')}><Square size={15} /></button>
          <button type="button" className={tb} title="Add line" aria-label="Add line" onClick={() => add('line')}><Minus size={15} /></button>
          <button type="button" className={tb} title="Add picture" aria-label="Add picture" onClick={() => add('imageField')}><ImageIcon size={15} /></button>
          <button type="button" className={tb} title="Add check code (QR)" aria-label="Add check code" onClick={() => add('qr')}><QrCode size={15} /></button>
          <button type="button" className={tb} title="Add barcode" aria-label="Add barcode" onClick={() => add('barcode')}><BarcodeIcon size={15} /></button>
          {['reportCard', 'transcript'].includes(template.family) && <button type="button" className={tb} title="Add subject table" aria-label="Add subject table" onClick={() => add('table')}><Table2 size={15} /></button>}
        </div>}
        {!ro && <div className="flex items-center gap-1 border-s border-[#e3e7e7] ps-2">
          <button type="button" className={tb} title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!hist.current.past.length} onClick={undo}><Undo2 size={15} /></button>
          <button type="button" className={tb} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!hist.current.future.length} onClick={redo}><Redo2 size={15} /></button>
          <button type="button" className={tb} title="Duplicate (Ctrl+D)" aria-label="Duplicate" disabled={!sel.length} onClick={duplicate}><Copy size={15} /></button>
          <button type="button" className={tb} title="Delete" aria-label="Delete layer" disabled={!sel.length} onClick={remove}><Trash2 size={15} /></button>
          <button type="button" className={tb} title="Bring forward (])" aria-label="Bring forward" disabled={!sel.length} onClick={() => order('up')}><ArrowUpToLine size={15} /></button>
          <button type="button" className={tb} title="Send backward ([)" aria-label="Send backward" disabled={!sel.length} onClick={() => order('down')}><ArrowDownToLine size={15} /></button>
        </div>}
        {!ro && <div className="flex items-center gap-1 border-s border-[#e3e7e7] ps-2" role="group" aria-label="Align">
          {[['left', AlignStartVertical, 'Align left'], ['hcenter', AlignCenterVertical, 'Centre across'], ['right', AlignEndVertical, 'Align right'], ['top', AlignStartHorizontal, 'Align top'], ['vcenter', AlignCenterHorizontal, 'Centre down'], ['bottom', AlignEndHorizontal, 'Align bottom']].map(([k, I, t]) => <button key={k} type="button" className={tb} title={t} aria-label={t} disabled={!sel.length} onClick={() => align(k)}><I size={15} /></button>)}
        </div>}
        <div className="ms-auto flex flex-wrap items-center gap-1">
          <button type="button" className={tb} aria-label="Zoom out" onClick={() => setZoom(Math.max(1, round(scale / 1.25)))}><ZoomOut size={15} /></button>
          <button type="button" className="rounded-md border border-[#e3e7e7] bg-white px-2 py-1.5 text-xs" onClick={() => setZoom(0)}>{zoom ? `${Math.round((scale / PX_PER_MM) * 100)}%` : 'Fit'}</button>
          <button type="button" className={tb} aria-label="Zoom in" onClick={() => setZoom(Math.min(10, round(scale * 1.25)))}><ZoomIn size={15} /></button>
          <select className="rounded-md border border-[#e3e7e7] bg-white px-2 py-1.5 text-xs" value={locale} onChange={(e) => setLocale(e.target.value)} aria-label="Preview language"><option value="en">English</option><option value="ur">اردو (Urdu)</option></select>
          <button type="button" className={btnGhost} onClick={makeProof}><FileText size={14} /> Proof PDF</button>
          {!ro && <button type="button" className={btnPrimary} disabled={saving || !dirty} onClick={() => save()}><Save size={14} /> {saving ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}</button>}
          {onClose && <button type="button" className={btnGhost} onClick={() => { if (dirty && !window.confirm('Leave without saving your changes?')) return; onClose(); }}>Close</button>}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={wrapRef} tabIndex={0} aria-label="Design canvas. Arrow keys move the selected layer, Tab picks the next layer." className="max-h-[78vh] min-h-[320px] overflow-auto rounded-xl border border-[#e3e7e7] bg-[#dfe3e3] p-4 outline-none focus:ring-2 focus:ring-[#2a5cac]/40" onPointerDown={() => setSel([])}>
          <div className="mx-auto w-fit" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <SideView layout={doc.layout} sideIndex={side} values={values} theme={doc.theme} images={images} locale={locale} scale={scale} showBleed={bleed > 0} showSafe style={{ boxShadow: '0 2px 12px rgba(0,0,0,.18)' }}>
              {layers.map((l) => {
                const picked = sel.includes(l.id); const hnd = (m, st) => <span key={m} onPointerDown={(e) => startDrag(e, l, m)} className="absolute h-2.5 w-2.5 rounded-sm border border-[#2a5cac] bg-white" style={{ ...st, cursor: `${m}-resize` }} />;
                return (
                  <div key={l.id} onPointerDown={(e) => startDrag(e, l, 'move')} title={l.name || l.type} className={`absolute ${l.hidden ? 'hidden' : ''}`}
                    style={{ left: l.x * scale, top: (l.type === 'line' ? l.y - 1 : l.y) * scale, width: Math.max(l.w * scale, 6), height: Math.max((l.type === 'line' ? Math.max(l.h, 2) : l.h) * scale, 6), cursor: l.locked || ro ? 'default' : 'move', outline: picked ? '1.5px solid #2a5cac' : undefined, outlineOffset: 1 }}>
                    {picked && !l.locked && !ro && sel.length === 1 && <>
                      {hnd('nw', { left: -5, top: -5 })}{hnd('ne', { right: -5, top: -5 })}{hnd('sw', { left: -5, bottom: -5 })}{hnd('se', { right: -5, bottom: -5 })}
                      {l.type !== 'line' && <>{hnd('n', { left: 'calc(50% - 5px)', top: -5 })}{hnd('s', { left: 'calc(50% - 5px)', bottom: -5 })}</>}
                      {hnd('w', { left: -5, top: 'calc(50% - 5px)' })}{hnd('e', { right: -5, top: 'calc(50% - 5px)' })}
                    </>}
                  </div>
                );
              })}
              {guides.map((g, i) => (g.v !== undefined ? <div key={i} className="pointer-events-none absolute top-0 h-full w-px bg-[#d6336c]" style={{ left: g.v * scale }} /> : <div key={i} className="pointer-events-none absolute left-0 h-px w-full bg-[#d6336c]" style={{ top: g.h * scale }} />))}
            </SideView>
          </div>
          <p className="mt-2 text-center text-[11px] text-[#5b6b7b]">{pw} × {ph} mm · green dashes: safe area · red dashes: bleed{!ro && ' · hold Alt to move without snapping'}</p>
        </div>

        <div className="rounded-xl border border-[#e3e7e7] bg-white">
          <div className="flex border-b border-[#e3e7e7] text-xs font-semibold" role="tablist">
            {[['props', 'Properties'], ['layers', `Layers (${layers.length})`], ['page', 'Page'], ['check', `Checks${problems.length ? ` (${problems.length})` : ''}`], ['proof', 'Proof']].map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`flex-1 px-2 py-2.5 ${tab === k ? 'border-b-2 border-[#2a5cac] text-[#2a5cac]' : 'text-[#5b6b7b]'}`}>{t}</button>)}
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-3 text-sm">
            {tab === 'props' && (!one ? <p className="py-6 text-center text-xs text-[#5b6b7b]">{sel.length > 1 ? `${sel.length} layers selected. Use the align tools above, or drag them together.` : 'Select a layer on the page to change it.'}</p> : (
              <fieldset disabled={ro} className="grid gap-2.5">
                <Field label="Name"><input className={`${inputCls} !py-1.5`} value={one.name || ''} maxLength={60} onChange={(e) => upd('name', e.target.value, true)} /></Field>
                <div className="grid grid-cols-4 gap-1.5"><Num label="X mm" value={one.x} onChange={(v) => upd('x', v ?? 0, true)} /><Num label="Y mm" value={one.y} onChange={(v) => upd('y', v ?? 0, true)} /><Num label="Width" value={one.w} min={0} onChange={(v) => upd('w', v ?? 1, true)} /><Num label="Height" value={one.h} min={0} onChange={(v) => upd('h', v ?? 1, true)} /></div>
                {one.type === 'text' && <>
                  <Field label={locale === 'ur' ? 'Urdu text (shown when Urdu is chosen)' : 'Text'} hint="Merge fields look like {{student.name}} and are filled in when the document is issued."><textarea className={inputCls} rows={3} value={(locale === 'ur' ? one.textUr : one.text) || ''} dir={locale === 'ur' ? 'rtl' : 'auto'} onChange={(e) => upd(locale === 'ur' ? 'textUr' : 'text', e.target.value, true)} /></Field>
                  <Field label="Insert a merge field"><select className={`${inputCls} !py-1.5`} value="" onChange={(e) => { if (e.target.value) upd(locale === 'ur' ? 'textUr' : 'text', `${(locale === 'ur' ? one.textUr : one.text) || ''}{{${e.target.value}}}`); }}><option value="">Choose…</option>{(family?.groups || []).map((g) => <optgroup key={g.key || g.label || g} label={g.label || g.key || String(g)}>{fieldOptions.filter(([k]) => k.startsWith(`${g.key || g}.`)).map(([k, f]) => <option key={k} value={k}>{f.label}{f.personal ? ' (personal)' : ''}</option>)}</optgroup>)}</select></Field>
                  <div className="grid grid-cols-3 gap-1.5"><Num label="Size pt" value={one.size} step={0.5} min={4} max={120} onChange={(v) => upd('size', v, true)} />
                    <Field label="Font"><select className={`${inputCls} !py-1.5`} value={one.font || 'sans'} onChange={(e) => upd('font', e.target.value)}>{FONT_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
                    <Field label="Line gap"><input type="number" step="0.05" min="0.8" max="2.5" className={`${inputCls} !py-1.5`} value={one.lineHeight ?? 1.2} onChange={(e) => upd('lineHeight', Number(e.target.value), true)} /></Field></div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <Field label="Across"><select className={`${inputCls} !py-1.5`} value={one.align || ''} onChange={(e) => upd('align', e.target.value || undefined)}><option value="">Auto</option><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></Field>
                    <Field label="Down"><select className={`${inputCls} !py-1.5`} value={one.valign || 'middle'} onChange={(e) => upd('valign', e.target.value)}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></Field>
                    <Field label="Too long"><select className={`${inputCls} !py-1.5`} value={one.fit || 'shrink'} onChange={(e) => upd('fit', e.target.value)}><option value="shrink">Shrink</option><option value="wrap">Wrap</option><option value="clip">Cut off</option></select></Field></div>
                  <div className="flex flex-wrap gap-3 text-xs">{[['bold', 'Bold'], ['italic', 'Italic'], ['upper', 'CAPITALS']].map(([k, t]) => <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!one[k]} onChange={(e) => upd(k, e.target.checked)} /> {t}</label>)}</div>
                  <ColorPick label="Colour" value={one.color} theme={doc.theme} onChange={(v) => upd('color', v)} />
                </>}
                {one.type === 'rect' && <><ColorPick label="Fill" value={one.fill} theme={doc.theme} onChange={(v) => upd('fill', v)} /><ColorPick label="Outline" value={one.stroke} theme={doc.theme} onChange={(v) => upd('stroke', v)} /><div className="grid grid-cols-3 gap-1.5"><Num label="Outline mm" value={one.strokeW} step={0.05} onChange={(v) => upd('strokeW', v)} /><Num label="Corner mm" value={one.radius} step={0.5} onChange={(v) => upd('radius', v)} /><Num label="Opacity" value={one.opacity ?? 1} step={0.05} min={0} max={1} onChange={(v) => upd('opacity', v)} /></div>
                  <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!one.bleed} onChange={(e) => upd('bleed', e.target.checked)} /> Runs off the edge (bleed)</label><label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!one.decorative} onChange={(e) => upd('decorative', e.target.checked)} /> Decoration only (hidden from screen readers)</label></>}
                {one.type === 'line' && <><ColorPick label="Colour" value={one.stroke} theme={doc.theme} onChange={(v) => upd('stroke', v)} /><div className="grid grid-cols-2 gap-1.5"><Num label="Thickness mm" value={one.strokeW} step={0.05} onChange={(v) => upd('strokeW', v)} /><Num label="Dash mm" value={one.dash} step={0.5} onChange={(v) => upd('dash', v)} /></div></>}
                {one.type === 'image' && <>
                  <Field label="Picture from"><select className={`${inputCls} !py-1.5`} value={one.source === 'asset' ? 'asset' : 'field'} onChange={(e) => patchLayers(sel, (l) => { l.source = e.target.value; if (e.target.value === 'asset') { delete l.field; l.assetId = assets?.[0]?._id; } else { delete l.assetId; l.field = imageFields[0]?.[0] || 'school.logo'; } })}><option value="field">The record (photo, logo)</option><option value="asset">An uploaded picture</option></select></Field>
                  {one.source === 'asset' ? <Field label="Picture" hint="Only pictures cleared for use can be published."><select className={`${inputCls} !py-1.5`} value={one.assetId || ''} onChange={(e) => upd('assetId', e.target.value)}>{(assets || []).map((a) => <option key={a._id} value={a._id}>{a.name}{a.verified ? '' : ' (not cleared)'}</option>)}</select></Field>
                    : <Field label="Field"><select className={`${inputCls} !py-1.5`} value={one.field || ''} onChange={(e) => upd('field', e.target.value)}>{imageFields.map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select></Field>}
                  <div className="grid grid-cols-2 gap-1.5"><Field label="Fit"><select className={`${inputCls} !py-1.5`} value={one.fit || 'cover'} onChange={(e) => upd('fit', e.target.value)}><option value="cover">Fill the box</option><option value="contain">Show whole picture</option></select></Field><Num label="Corner mm" value={one.radius} onChange={(v) => upd('radius', v)} /></div>
                  <Field label="Description for screen readers"><input className={`${inputCls} !py-1.5`} value={one.alt || ''} maxLength={120} onChange={(e) => upd('alt', e.target.value, true)} /></Field>
                </>}
                {(one.type === 'qr' || one.type === 'barcode') && <><p className="rounded-lg bg-[#f7f6f2] p-2 text-xs text-[#3b4a5c]">{one.type === 'qr' ? 'This code carries only the private check link, never personal details. Anyone who scans it sees whether the document is genuine.' : 'This barcode carries only the document number.'}</p><Field label="Description for screen readers"><input className={`${inputCls} !py-1.5`} value={one.alt || ''} maxLength={120} onChange={(e) => upd('alt', e.target.value, true)} /></Field></>}
                {one.type === 'table' && <><Num label="Row height mm" value={one.rowH} onChange={(v) => upd('rowH', v)} /><Num label="Text size pt" value={one.size} onChange={(v) => upd('size', v)} /><ColorPick label="Header colour" value={one.header} theme={doc.theme} onChange={(v) => upd('header', v)} />
                  <div className="text-[11px] font-semibold text-[#3b4a5c]">Columns</div>{(one.columns || []).map((c, i) => <div key={i} className="grid grid-cols-[1fr_56px_74px] gap-1.5"><input className={`${inputCls} !py-1.5`} value={c.title} aria-label={`Column ${i + 1} title`} onChange={(e) => patchLayers(sel, (l) => { l.columns[i].title = e.target.value; }, `col${i}`)} /><input type="number" className={`${inputCls} !py-1.5`} value={c.w} step="0.5" min="1" aria-label={`Column ${i + 1} width`} onChange={(e) => patchLayers(sel, (l) => { l.columns[i].w = Number(e.target.value) || 1; }, `colw${i}`)} /><select className={`${inputCls} !py-1.5`} value={c.align || 'left'} aria-label={`Column ${i + 1} align`} onChange={(e) => patchLayers(sel, (l) => { l.columns[i].align = e.target.value; })}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></div>)}</>}
                <div className="grid grid-cols-2 gap-1.5"><Num label="Turn (degrees)" value={one.rotate} step={1} min={-180} max={180} onChange={(v) => upd('rotate', v)} /></div>
              </fieldset>
            ))}
            {tab === 'layers' && (layers.length === 0 ? <p className="py-6 text-center text-xs text-[#5b6b7b]">This side is empty. Add something with the toolbar.</p> : <ul className="grid gap-1" aria-label="Layers, top first">{[...layers].reverse().map((l) => { const I = TYPE_ICON[l.type] || Square; return (
              <li key={l.id} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${sel.includes(l.id) ? 'border-[#2a5cac] bg-[#eef3fb]' : 'border-[#e3e7e7]'}`}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-start" onClick={(e) => setSel(e.shiftKey ? (sel.includes(l.id) ? sel.filter((x) => x !== l.id) : [...sel, l.id]) : [l.id])}><I size={14} className="shrink-0 text-[#5b6b7b]" /><span className={`truncate text-xs ${l.hidden ? 'opacity-50' : ''}`}>{l.name || l.type}</span></button>
                {!ro && <><button type="button" aria-label={l.hidden ? 'Show layer' : 'Hide layer'} className="p-1 text-[#5b6b7b]" onClick={() => patchLayers([l.id], (x) => { x.hidden = !x.hidden; })}>{l.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button><button type="button" aria-label={l.locked ? 'Unlock layer' : 'Lock layer'} className="p-1 text-[#5b6b7b]" onClick={() => patchLayers([l.id], (x) => { x.locked = !x.locked; })}>{l.locked ? <Lock size={14} /> : <Unlock size={14} />}</button></>}
              </li>); })}</ul>)}
            {tab === 'page' && (
              <fieldset disabled={ro} className="grid gap-3">
                <div className="rounded-lg bg-[#f7f6f2] p-2 text-xs text-[#3b4a5c]">Paper: <b>{doc.layout.paper.key}</b> ({pw} × {ph} mm). The paper size is fixed by the document type.</div>
                {(['A4', 'A5'].includes(doc.layout.paper.key)) && <Field label="Direction"><select className={inputCls} value={doc.layout.paper.orientation} onChange={(e) => commit((d) => { d.layout.paper.orientation = e.target.value; })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></Field>}
                <div className="grid grid-cols-2 gap-2"><Num label="Bleed mm" value={doc.layout.paper.bleedMm} step={0.5} min={0} max={6} onChange={(v) => commit((d) => { d.layout.paper.bleedMm = v ?? 0; }, 'bleed')} /><Num label="Safe margin mm" value={doc.layout.paper.safeMm} step={0.5} min={0} max={15} onChange={(v) => commit((d) => { d.layout.paper.safeMm = v ?? 0; }, 'safe')} /></div>
                <ColorPick label="Page background" value={sideObj.background} theme={doc.theme} onChange={(v) => commit((d) => { d.layout.sides[side].background = v || 'theme.paper'; })} />
                <div><div className="mb-1 text-[11px] font-semibold text-[#3b4a5c]">School colours</div><div className="grid gap-1.5">{THEME_KEYS.map(([k, t]) => <label key={k} className="flex items-center justify-between gap-2 text-xs">{t}<input type="color" value={doc.theme[k] || DEFAULT_THEME[k]} onChange={(e) => commit((d) => { d.theme[k] = e.target.value.toUpperCase(); }, `theme${k}`)} className="h-8 w-14 cursor-pointer rounded border border-[#e3e7e7]" aria-label={t} /></label>)}</div>
                  <button type="button" className="mt-1.5 text-xs text-[#2a5cac] underline" onClick={() => commit((d) => { d.theme = { ...DEFAULT_THEME }; })}>Back to the Aulensia colours</button></div>
                <div><div className="mb-1 text-[11px] font-semibold text-[#3b4a5c]">Languages this design supports</div><div className="flex gap-3 text-xs">{[['en', 'English'], ['ur', 'Urdu']].map(([k, t]) => <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={doc.locales.includes(k)} disabled={k === 'en'} onChange={(e) => commit((d) => { d.locales = e.target.checked ? [...new Set([...d.locales, k])] : d.locales.filter((x) => x !== k); })} /> {t}</label>)}</div></div>
              </fieldset>
            )}
            {tab === 'check' && (!report ? <p className="py-6 text-center text-xs text-[#5b6b7b]">Save the draft to run the checks.</p> : <div className="grid gap-2">
              <div className={`flex items-center gap-2 rounded-lg p-2 text-xs font-semibold ${(report.errors || []).length ? 'bg-[#fff1f2] text-[#9f1239]' : 'bg-[#ecf6f1] text-[#1f6b4d]'}`}>{(report.errors || []).length ? <AlertTriangle size={14} /> : <Check size={14} />}{(report.errors || []).length ? `${report.errors.length} problem${report.errors.length > 1 ? 's' : ''} must be fixed before this can be published` : 'Ready to send for review'}{dirty && <span className="ms-auto font-normal opacity-70">checking…</span>}</div>
              {problems.map((p, i) => <button key={i} type="button" onClick={() => { if (p.layerId) { if (p.side && p.side !== 'front' && doc.layout.sides[1]) setSide(1); else setSide(0); setSel([p.layerId]); setTab('props'); } }} className={`rounded-lg border p-2 text-start text-xs ${p.kind === 'error' ? 'border-[#e3b4ac] bg-[#fff8f6]' : 'border-[#ecd9a5] bg-[#fffbee]'}`}><Pill value={p.kind === 'error' ? 'Suspended' : 'Pending'}>{p.kind === 'error' ? 'Must fix' : 'Advice'}</Pill> <span className="ms-1">{p.message}</span></button>)}
              {(report.contrast || []).length > 0 && <div><div className="mb-1 text-[11px] font-semibold text-[#3b4a5c]">Text contrast</div><ul className="grid gap-1">{report.contrast.map((c, i) => <li key={i} className="flex items-center justify-between rounded border border-[#e3e7e7] px-2 py-1 text-xs"><span className="truncate">{c.name}</span><span className={c.ok ? 'text-[#1f6b4d]' : 'font-semibold text-[#9f1239]'}>{c.ratio}:1 {c.ok ? '✓' : `needs ${c.need}`}</span></li>)}</ul></div>}
              {lowContrast.length === 0 && (report.contrast || []).length > 0 && <p className="text-[11px] text-[#5b6b7b]">All text is easy enough to read on its background.</p>}
            </div>)}
            {tab === 'proof' && (proof ? <div className="grid gap-2"><iframe title="Proof PDF" src={proof.url} className="h-[56vh] w-full rounded-lg border border-[#e3e7e7]" />{proof.notes && <p className="rounded bg-[#fffbee] p-2 text-xs">{proof.notes}</p>}<a href={proof.url} download={`proof-${template.name}.pdf`} className={btnGhost}>Download the proof</a></div> : <div className="py-6 text-center"><p className="mb-3 text-xs text-[#5b6b7b]">A proof is the real PDF with sample details, marked PROOF.</p><button type="button" className={btnPrimary} onClick={makeProof}>Make a proof PDF</button></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
