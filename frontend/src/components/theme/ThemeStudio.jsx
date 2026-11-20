import React, { useEffect, useState } from 'react';
import { Check, X as XIcon, Copy, Trash2, Globe, Palette, Languages, Eye, EyeOff, RotateCcw } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs } from '../early/earlyKit';
import { check, clean, DEFAULTS } from '../../theme/color';
import { useTheme } from '../../theme/ThemeProvider';
import usePlan from '../../utils/usePlan';

const when = (d) => (d ? `⁦${new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}⁩` : '');
const changed = () => window.dispatchEvent(new Event('theme-changed'));
const MODE_WORD = { light: 'Always light', dark: 'Always dark', system: 'Follow each person’s device' };
const RADIUS_WORD = { square: 'Square corners', soft: 'Soft corners', round: 'Round corners' };
const FONT_WORD = { sans: 'Clean sans (Inter)', serif: 'Classic serif', humanist: 'Friendly humanist' };
const STATE_TONE = { Published: 'Active', Archived: 'None', Draft: 'Pending' };
const copy = (text) => { try { navigator.clipboard.writeText(text); } catch (e) { /* ignore */ } };

function Swatch({ hex, label }) { return <span className="inline-flex items-center gap-2"><span className="inline-block h-5 w-5 rounded border border-black/20" style={{ background: hex }} aria-hidden="true" /><span dir="ltr" className="text-xs">{label || hex}</span></span>; }

// a small picture of the look, painted with fixed colours so it shows exactly what was chosen
function Mini({ tk, dark }) {
  const bg = dark ? '#0F1720' : '#F7F6F2'; const card = dark ? '#16202B' : '#FFFFFF'; const ink = dark ? '#E8EDF2' : '#1B2837'; const r = { square: 2, soft: 10, round: 18 }[tk.radius]; const ff = { sans: 'Inter, system-ui, sans-serif', serif: 'Georgia, serif', humanist: "'Segoe UI', Candara, sans-serif" }[tk.font];
  const brand = dark ? check({ ...tk }).darkPrimary : tk.primary;
  return (
    <div data-no-i18n aria-hidden="true" className="rounded-xl border border-black/10 p-3" style={{ background: bg, fontFamily: ff, color: ink }}>
      <div className="mb-2 flex items-center justify-between"><strong style={{ color: brand }}>School name</strong><span style={{ background: tk.accent, borderRadius: r, color: '#fff', fontSize: 11, padding: '2px 8px' }}>Notice</span></div>
      <div style={{ background: card, borderRadius: r, padding: 10, border: `1px solid ${dark ? '#27384a' : '#E3E7E7'}` }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>Attendance today: 96%</div>
        <span style={{ background: tk.primary, color: '#fff', borderRadius: r, padding: '5px 12px', fontSize: 12, display: 'inline-block' }}>Save</span>{' '}
        <span style={{ border: `1px solid ${brand}`, color: brand, borderRadius: r, padding: '4px 12px', fontSize: 12, display: 'inline-block' }}>Cancel</span>
      </div>
    </div>
  );
}

function Look() {
  const g = useGet('/theme'); const { preview, previewing } = useTheme(); const [tk, setTk] = useState(null); const [pub, setPub] = useState(null); const [back, setBack] = useState(null); const [err, setErr] = useState('');
  const d = g.data; useEffect(() => { if (d && d.draft) setTk(clean(d.draft.tokens)); else setTk(null); }, [d]);
  useEffect(() => () => preview(null), [preview]);
  useEffect(() => { if (previewing && tk) preview(tk); }, [tk]); // eslint-disable-line react-hooks/exhaustive-deps
  const rep = tk ? check(tk) : null; const set = (k, v) => setTk({ ...tk, [k]: v }); const reload = async () => { await g.reload(); changed(); };
  const start = (fromVersion) => call(() => apiClient.post('/theme/draft', fromVersion ? { fromVersion } : {}), 'Draft started', g.reload);
  const save = () => call(() => apiClient.put('/theme/draft', { tokens: tk }), 'Draft saved', g.reload);
  const discard = () => call(() => apiClient.delete('/theme/draft'), 'Draft discarded', async () => { preview(null); await g.reload(); });
  return (
    <div className="grid gap-4">
      <Loading g={g}>{d && <>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-bold">The look people see now</h4>
            <p className="text-xs text-[#5b6b7b]">{d.live ? `Version ${d.live.version}${d.live.note ? ` · ${d.live.note}` : ''} · published ${when(d.live.publishedAt)}${d.live.publishedByName ? ` by ${d.live.publishedByName}` : ''}` : 'The standard Aulensia look. Nothing has been published yet.'}</p></div>
            {!d.draft && <button className={btnPrimary} onClick={() => start()}><Palette size={16} aria-hidden="true" />Change the look</button>}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><Mini tk={clean((d.live || {}).tokens || DEFAULTS)} /><Mini tk={clean((d.live || {}).tokens || DEFAULTS)} dark /></div>
        </Card>
        {d.draft && tk && rep && <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold">Draft — version {d.draft.version}</h4>
            <button className={btnGhost} onClick={() => { if (previewing) preview(null); else preview(tk); }}>{previewing ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{previewing ? 'Stop trying it on this screen' : 'Try it on this whole screen'}</button></div>
          {previewing && <div className="mb-3"><Note tone="info">You are trying this draft on your screen only. Nobody else sees it until you publish.</Note></div>}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Main colour" hint="Buttons, links and headings"><div className="flex gap-2"><input type="color" aria-label="Main colour picker" className="h-10 w-12 cursor-pointer rounded border border-[#e3e7e7] bg-white p-0.5" value={tk.primary} onChange={(e) => set('primary', e.target.value.toUpperCase())} /><input className={inputCls} dir="ltr" aria-label="Main colour code" value={tk.primary} maxLength={7} onChange={(e) => set('primary', e.target.value)} /></div></Field>
            <Field label="Second colour" hint="Document headings and small marks"><div className="flex gap-2"><input type="color" aria-label="Second colour picker" className="h-10 w-12 cursor-pointer rounded border border-[#e3e7e7] bg-white p-0.5" value={tk.accent} onChange={(e) => set('accent', e.target.value.toUpperCase())} /><input className={inputCls} dir="ltr" aria-label="Second colour code" value={tk.accent} maxLength={7} onChange={(e) => set('accent', e.target.value)} /></div></Field>
            <Field label="Light or dark"><select className={inputCls} value={tk.mode} onChange={(e) => set('mode', e.target.value)}>{Object.entries(MODE_WORD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Corners"><select className={inputCls} value={tk.radius} onChange={(e) => set('radius', e.target.value)}>{Object.entries(RADIUS_WORD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Letters"><select className={inputCls} value={tk.font} onChange={(e) => set('font', e.target.value)}>{Object.entries(FONT_WORD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><Mini tk={rep.tokens} /><Mini tk={rep.tokens} dark /></div>
          <h5 className="mb-1 mt-4 text-sm font-bold">Can everyone read it?</h5>
          <ul className="grid gap-1.5" aria-label="Contrast checks">{rep.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-lg border border-[#e3e7e7] bg-white p-2 text-sm"><span className={`mt-0.5 ${c.pass ? 'text-[#215a52]' : 'text-[#9f1239]'}`}>{c.pass ? <Check size={16} aria-label="Passes" /> : <XIcon size={16} aria-label="Fails" />}</span>
              <div className="min-w-0 flex-1"><div className="font-medium">{c.label}</div><div className="text-xs text-[#5b6b7b]"><span dir="ltr">{c.ratio}:1</span> — needs <span dir="ltr">{c.min}:1</span>. {c.pass ? '' : c.why}</div></div><Swatch hex={c.fg} /></li>))}</ul>
          {!rep.ok && <div className="mt-3"><Note tone="warn">This look is not ready to publish. {rep.errors.length} check{rep.errors.length > 1 ? 's' : ''} failed. <button className="ms-1 font-semibold underline" onClick={() => set('primary', rep.suggestion)}>Use the nearest colour that works <Swatch hex={rep.suggestion} /></button></Note></div>}
          {err && <p className="mt-2 text-sm text-[#9f1239]" role="alert">{err}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2"><button className={btnDanger} onClick={discard}><Trash2 size={16} aria-hidden="true" />Discard draft</button><button className={btnGhost} onClick={save}>Save draft</button><button className={btnPrimary} disabled={!rep.ok} onClick={async () => { await call(() => apiClient.put('/theme/draft', { tokens: tk }), null); setPub({ note: d.draft.note || '' }); }}>Publish…</button></div>
        </Card>}
        <Card><h4 className="mb-2 text-sm font-bold">Past versions</h4>
          {d.versions.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing published yet.</p> : (
            <ul className="grid gap-2">{d.versions.map((v) => (
              <li key={v._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e3e7e7] p-2 text-sm"><div className="flex items-center gap-3"><Swatch hex={v.tokens.primary} /><div><div className="font-medium">Version {v.version} <Pill value={STATE_TONE[v.state]}>{v.state === 'Published' ? 'Live' : v.state}</Pill></div><div className="text-xs text-[#5b6b7b]">{v.note || '—'} · {when(v.publishedAt)}{v.publishedByName ? ` · ${v.publishedByName}` : ''}{v.rollbackOf ? ` · copy of version ${v.rollbackOf}` : ''}</div></div></div>
                {v.state !== 'Published' && <div className="flex gap-2">{!d.draft && <button className={btnGhost} onClick={() => start(v._id)}>Start a draft from this</button>}<button className={btnGhost} onClick={() => setBack({ v, reason: '' })}><RotateCcw size={16} aria-hidden="true" />Go back to this</button></div>}</li>))}</ul>)}
        </Card></>}</Loading>
      {pub && <Modal title="Publish this look" onClose={() => setPub(null)}><div className="grid gap-3"><p className="text-sm">Everyone in the school sees it the next time a page loads. Printed documents use the new colours too.</p><Field label="What changed (optional)"><input className={inputCls} maxLength={200} value={pub.note} onChange={(e) => setPub({ note: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setPub(null)}>Cancel</button><button className={btnPrimary} onClick={() => call(() => apiClient.post('/theme/draft/publish', { note: pub.note }), 'Published', async () => { setPub(null); preview(null); await reload(); })}>Publish</button></div></div></Modal>}
      {back && <Modal title={`Go back to version ${back.v.version}`} onClose={() => setBack(null)}><div className="grid gap-3"><p className="text-sm">This publishes a copy of version {back.v.version} as the newest version. Nothing is lost.</p><Field label="Why are you going back?" hint="At least 5 characters. It is kept in the history."><input className={inputCls} value={back.reason} onChange={(e) => setBack({ ...back, reason: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setBack(null)}>Cancel</button><button className={btnPrimary} disabled={back.reason.trim().length < 5} onClick={() => call(() => apiClient.post(`/theme/versions/${back.v._id}/rollback`, { reason: back.reason }), 'Went back', async () => { setBack(null); await reload(); })}>Go back</button></div></div></Modal>}
    </div>
  );
}

const DOM_STATE = { Pending: ['Pending', 'Waiting for the ownership record'], Verified: ['Pending', 'Owned — point it at us'], Active: ['Active', 'Live'], Failed: ['Suspended', 'Stopped working'] };
function Domains() {
  const g = useGet('/theme/domains'); const { has } = usePlan(); const [host, setHost] = useState(''); const [msg, setMsg] = useState({}); const d = g.data;
  const run = async (id, what) => { const r = await call(() => apiClient.post(`/theme/domains/${id}/${what}`), null); if (r) { setMsg((m) => ({ ...m, [id]: r.data.message })); await g.reload(); } };
  return (
    <div className="grid gap-4">
      {!has('whiteLabel') && <Note>Your own web address is part of the Premium plan. Names on the shared platform address are included in every plan only when the platform owner enables them.</Note>}
      <Card><h4 className="text-sm font-bold">Add an address</h4><p className="mb-2 text-xs text-[#5b6b7b]">Type a name such as <span dir="ltr">portal.myschool.edu.pk</span>{d && d.rootDomain ? <> or <span dir="ltr">yourschool.{d.rootDomain}</span></> : null}. People who open it see your school name and colours on the sign-in page.</p>
        <div className="flex flex-wrap gap-2"><input className={`${inputCls} max-w-sm`} dir="ltr" placeholder="portal.myschool.edu.pk" aria-label="Web address" value={host} onChange={(e) => setHost(e.target.value)} /><button className={btnPrimary} disabled={host.trim().length < 4} onClick={() => call(() => apiClient.post('/theme/domains', { host }), 'Address added', async () => { setHost(''); await g.reload(); })}><Globe size={16} aria-hidden="true" />Add</button></div></Card>
      <Loading g={g}>{d && (d.domains.length === 0 ? <EmptyState title="No addresses yet" text="Add one above to give your school its own sign-in page." /> : (
        <div className="grid gap-3">{d.domains.map((x) => { const [tone, word] = DOM_STATE[x.status] || ['None', x.status]; return (
          <Card key={x._id}><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold" dir="ltr">{x.host}</div><div className="mt-1 flex items-center gap-2 text-xs"><Pill value={tone}>{word}</Pill><span className="text-[#5b6b7b]">{x.kind === 'subdomain' ? 'On the platform address' : 'Your own address'}</span></div></div>
            <button className={btnDanger} aria-label={`Remove ${x.host}`} onClick={() => call(() => apiClient.delete(`/theme/domains/${x._id}`), 'Removed', g.reload)}><Trash2 size={16} aria-hidden="true" /></button></div>
            {x.status === 'Pending' && x.dns && <div className="mt-3 grid gap-2 text-sm"><p><strong>Step 1.</strong> At your domain provider, add this TXT record to prove you own the address:</p>
              <div className="rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] p-2 text-xs" dir="ltr"><div>Name: <b>{x.dns.txtName}</b> <button className="ms-1 underline" aria-label="Copy name" onClick={() => copy(x.dns.txtName)}><Copy size={12} className="inline" /></button></div><div className="break-all">Value: <b>{x.dns.txtValue}</b> <button className="ms-1 underline" aria-label="Copy value" onClick={() => copy(x.dns.txtValue)}><Copy size={12} className="inline" /></button></div></div>
              <div><button className={btnPrimary} onClick={() => run(x._id, 'verify')}>Check now</button></div></div>}
            {x.status === 'Verified' && x.dns && <div className="mt-3 grid gap-2 text-sm"><p><strong>Step 2.</strong> Point the address at the platform with a CNAME record:</p>
              <div className="rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] p-2 text-xs" dir="ltr"><div>Name: <b>{x.dns.cname}</b></div><div>Points to: <b>{x.dns.cnameTarget}</b> <button className="ms-1 underline" aria-label="Copy target" onClick={() => copy(x.dns.cnameTarget)}><Copy size={12} className="inline" /></button></div></div>
              <div><button className={btnPrimary} onClick={() => run(x._id, 'activate')}>Check and go live</button></div></div>}
            {x.status === 'Failed' && <div className="mt-3"><Note tone="warn">{x.lastError || 'The records could not be found.'} <button className="ms-1 font-semibold underline" onClick={() => run(x._id, 'activate')}>Check again</button></Note></div>}
            {x.status === 'Active' && <p className="mt-3 text-sm text-[#215a52]">Live. <a className="underline" dir="ltr" href={`https://${x.host}`} target="_blank" rel="noreferrer">https://{x.host}</a></p>}
            {msg[x._id] && x.status !== 'Active' && <p className="mt-2 text-sm text-[#5b6b7b]" role="status">{msg[x._id]}</p>}
            {x.lastCheckedAt && <p className="mt-1 text-[11px] text-[#5b6b7b]">Last checked {when(x.lastCheckedAt)}</p>}</Card>); })}</div>))}</Loading>
    </div>
  );
}

function Wording() {
  const [q, setQ] = useState(''); const g = useGet('/theme/i18n', { q }); const [f, setF] = useState({ source: '', text: '', note: '' }); const [warn, setWarn] = useState([]); const d = g.data;
  const save = () => call(() => apiClient.put('/theme/i18n/overrides', f), null, async (r) => { setWarn(r.data.warnings || []); setF({ source: '', text: '', note: '' }); await g.reload(); changed(); });
  return (
    <div className="grid gap-4">
      <Note>Your school can say things its own way in Urdu. A label you set here replaces the standard Urdu for everyone in your school.</Note>
      <Card><h4 className="mb-2 text-sm font-bold">Set a label</h4>
        <div className="grid gap-3 md:grid-cols-2"><Field label="English label" hint="Exactly as it appears on screen"><input className={inputCls} dir="ltr" maxLength={300} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
          <Field label="Urdu wording" hint="Keep any {name} style placeholders"><input className={inputCls} dir="rtl" lang="ur" maxLength={300} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field></div>
        <Field label="Note (optional)"><input className={inputCls} maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {warn.map((w) => <p key={w} className="mt-2 text-sm text-[#8a4636]" role="status">{w}</p>)}
        <div className="mt-3 flex justify-end"><button className={btnPrimary} disabled={!f.source.trim() || !f.text.trim()} onClick={save}><Languages size={16} aria-hidden="true" />Save wording</button></div></Card>
      <div><input className={`${inputCls} max-w-sm`} type="search" placeholder="Search labels" aria-label="Search labels" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Loading g={g}>{d && <>
        <Card><h4 className="mb-2 text-sm font-bold">Without Urdu yet {d.missingTotal ? <span className="text-xs font-normal text-[#5b6b7b]">({d.missingTotal})</span> : null}</h4>
          {d.missing.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing is waiting. Labels people see in Urdu without a translation appear here, counted by how often.</p> : (
            <ul className="grid gap-1.5">{d.missing.map((m) => <li key={m._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e3e7e7] p-2 text-sm"><span dir="ltr">{m.source} <span className="text-xs text-[#5b6b7b]">· seen {m.count}×</span></span>
              <span className="flex gap-2"><button className={btnGhost} onClick={() => { setF({ source: m.source, text: '', note: '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Add Urdu</button><button className={btnGhost} onClick={() => call(() => apiClient.post(`/theme/i18n/missing/${m._id}/dismiss`), null, g.reload)}>Ignore</button></span></li>)}</ul>)}</Card>
        <Card><h4 className="mb-2 text-sm font-bold">Your school’s wording</h4>
          {d.overrides.length === 0 ? <p className="text-sm text-[#5b6b7b]">No custom wording yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-start text-sm"><caption className="sr-only">Custom Urdu wording</caption><thead className="text-xs text-[#5b6b7b]"><tr><th scope="col" className="p-2 text-start">English</th><th scope="col" className="p-2 text-start">Urdu</th><th scope="col" className="p-2 text-start">Set by</th><th scope="col" className="p-2"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{d.overrides.map((o) => <tr key={o._id} className="border-t border-[#eef0f0]"><td className="p-2" dir="ltr">{o.source}</td><td className="p-2" dir="rtl" lang="ur">{o.text}</td><td className="p-2 text-xs text-[#5b6b7b]">{o.updatedByName || '—'}</td><td className="p-2"><span className="flex gap-2"><button className={btnGhost} onClick={() => setF({ source: o.source, text: o.text, note: o.note || '' })}>Edit</button><button className={btnDanger} aria-label={`Remove wording for ${o.source}`} onClick={() => call(() => apiClient.delete(`/theme/i18n/overrides/${o._id}`), 'Removed', async () => { await g.reload(); changed(); })}><Trash2 size={16} aria-hidden="true" /></button></span></td></tr>)}</tbody></table></div>)}</Card></>}</Loading>
    </div>
  );
}

export default function ThemeStudio() {
  const [tab, setTab] = useState('look');
  return (
    <div className="grid gap-4">
      <div><h3 className="text-lg font-bold">Brand &amp; theme</h3><p className="text-sm text-[#5b6b7b]">Your colours, your own web address and your own Urdu wording. Nothing changes for anyone until you publish.</p></div>
      <Tabs label="Brand and theme" value={tab} onChange={setTab} items={[['look', 'Look'], ['domain', 'Web address'], ['wording', 'Urdu wording']]} />
      {tab === 'look' && <Look />}{tab === 'domain' && <Domains />}{tab === 'wording' && <Wording />}
    </div>
  );
}
