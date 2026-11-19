import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, Check, Copy, Download, FileCheck2, FileText, Layers, PencilRuler, Plus, Send, Upload } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Field, Modal, Pill, Stat, btnDanger, btnGhost, btnPrimary, errMsg, fmtDate, inputCls } from '../ui';
import { Body, Row, Sub, Td, Tbl } from '../attendance/deskKit';
import { Reason } from '../safety/safetyKit';
import { useGet, call } from '../timetable/planKit';
import { Thumb, blobUrl, STATE_TONE, STATE_LABEL } from './layoutKit';
import CanvasEditor from './CanvasEditor';
import { IssueDesk, IssuedList, PrintQueue, usePdf } from './IssueDesk';
import AssetsDesk from './AssetsDesk';

// Documents studio (PRD E12): templates, review, issuing, print queue and pictures in one place.

const NewTemplate = ({ catalog, templates, onClose, onDone }) => {
  const [name, setName] = useState(''); const [family, setFamily] = useState('certificate'); const [from, setFrom] = useState(''); const [busy, setBusy] = useState(false);
  const pool = templates.filter((t) => t.family === family && t.liveVersion);
  const go = async () => { setBusy(true); const r = await call(() => apiClient.post('/studio/templates', { name, family, basedOnId: from || undefined }), 'Template created. Opening the editor…'); setBusy(false); if (r) onDone(r.data); };
  return (
    <Modal title="New template" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Name"><input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sports day certificate" autoFocus /></Field>
        <Field label="What is it for?"><select className={inputCls} value={family} onChange={(e) => { setFamily(e.target.value); setFrom(''); }}>{catalog.families.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>
        <Field label="Start from" hint="Every template starts as a copy of a design that already passes the checks."><select className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)}><option value="">The Aulensia original</option>{pool.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || !name.trim()} onClick={go}>Create</button></div>
    </Modal>
  );
};

const ImportModal = ({ onClose, onDone }) => {
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false);
  const go = async () => { const fd = new FormData(); fd.append('file', file); setBusy(true); const r = await call(() => apiClient.post('/studio/templates/import', fd), (x) => `Imported. ${x.data.assetsToClear ? `${x.data.assetsToClear} picture(s) need clearing before it can go live.` : ''}`); setBusy(false); if (r) onDone(r.data); };
  return (
    <Modal title="Import a template" onClose={onClose}>
      <p className="mb-3 text-sm text-[#3b4a5c]">Choose a template file (.json) exported from Aulensia. The file must state the licence it may be used under. Imported pictures stay blocked until an administrator confirms their licence.</p>
      <input type="file" accept="application/json,.json" aria-label="Template file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!file || busy} onClick={go}><Upload size={14} /> Import</button></div>
    </Modal>
  );
};

function TemplateDetail({ id, can, catalog, onBack, onEdit, reloadAll }) {
  const g = useGet(`/studio/templates/${id}`); const [ask, setAsk] = useState(null); const [copyName, setCopyName] = useState(null);
  const t = g.data?.template; const versions = g.data?.versions || [];
  const family = catalog.families.find((f) => f.key === t?.family);
  const run = async (fn, ok) => { const r = await call(fn, ok); if (r) { await g.reload(); reloadAll(); } return r; };
  const pdf = usePdf(); const proof = (v) => pdf.open(`Proof ${v.version}`, `/studio/templates/${id}/versions/${v._id}/proof`);
  const exportIt = async (v) => { try { const r = await apiClient.get(`/studio/templates/${id}/versions/${v._id}/export`, { responseType: 'blob' }); const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `${t.key || 'template'}-v${v.version}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); } catch (e) { toast.error(errMsg(e)); } };
  if (g.loading && !t) return <Card><div className="skeleton h-40" /></Card>;
  if (!t) return <EmptyState title={g.error || 'Template not found'} action={<button className={btnGhost} onClick={onBack}>Back</button>} />;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2"><button className={btnGhost} onClick={onBack}><ArrowLeft size={14} /> Templates</button>
        <h3 className="text-lg font-semibold text-[#1b2837]">{t.name}</h3><Pill value={t.isBase ? 'Active' : 'None'}>{t.isBase ? 'Aulensia original' : 'Our template'}</Pill>{t.archived && <Pill value="None">Retired</Pill>}
        {can.manage && <div className="ms-auto flex gap-2">
          {t.liveVersion && <button className={btnGhost} onClick={() => setCopyName(`${t.name} copy`)}><Copy size={14} /> {t.isBase ? 'Make my own copy' : 'Copy'}</button>}
          {!t.isBase && <button className={btnGhost} onClick={() => run(() => apiClient.post(`/studio/templates/${id}/archive`, { archived: !t.archived }), t.archived ? 'Restored' : 'Retired')}>{t.archived ? 'Restore' : 'Retire'}</button>}
        </div>}
      </div>
      <Card className="!p-4 text-sm"><div className="grid gap-1 text-[#3b4a5c] sm:grid-cols-3"><div><b>Type:</b> {t.familyLabel}{t.kind ? ` · ${t.kind}` : ''}</div><div><b>Paper:</b> {t.paper?.key}</div><div><b>Documents issued:</b> {g.data.issuedCount}</div></div>
        {t.provenance?.license && <div className="mt-2 text-xs text-[#5b6b7b]">Source: {t.provenance.source || 'unknown'} · Licence: {t.provenance.license}{t.provenance.author ? ` · by ${t.provenance.author}` : ''}</div>}
        {t.isBase && <div className="mt-2 text-xs text-[#5b6b7b]">An original cannot be changed. Make your own copy, change that, and send it for review.</div>}</Card>
      <Card className="!p-0 overflow-hidden"><div className="border-b border-[#e3e7e7] px-4 py-3 text-sm font-semibold">Versions</div>
        <Tbl head={['Version', 'State', 'Checked', 'History', '']}>
          {versions.map((v) => (
            <Row key={v._id}>
              <Td><b>v{v.version}</b></Td><Td><Pill value={STATE_TONE[v.state]}>{STATE_LABEL[v.state]}</Pill></Td>
              <Td>{v.report ? ((v.report.errors || []).length ? <span className="inline-flex items-center gap-1 text-[#9f1239]"><AlertTriangle size={13} /> {v.report.errors.length} to fix</span> : <span className="inline-flex items-center gap-1 text-[#1f6b4d]"><Check size={13} /> Passed</span>) : '—'}</Td>
              <Td><Sub>{v.state === 'Draft' && v.decisionNote ? `Sent back: ${v.decisionNote}` : v.publishedAt ? `Live since ${fmtDate(v.publishedAt)}` : v.submittedAt ? `Sent for review by ${v.submittedByName || ''}` : `Started by ${v.createdByName || ''}`}</Sub>{v.decidedByName && v.state !== 'Draft' && <Sub>Decided by {v.decidedByName}</Sub>}</Td>
              <Td><div className="flex flex-wrap justify-end gap-1.5">
                <button className={btnGhost} onClick={() => onEdit(id, v._id, !(v.state === 'Draft' && can.manage && !t.isBase))}>{v.state === 'Draft' && can.manage && !t.isBase ? <><PencilRuler size={14} /> Edit</> : 'View'}</button>
                <button className={btnGhost} onClick={() => proof(v)}><FileText size={14} /> Proof</button>
                {can.manage && v.state === 'Draft' && !t.isBase && <button className={btnPrimary} onClick={() => run(() => apiClient.post(`/studio/templates/${id}/versions/${v._id}/submit`), 'Sent for review')}><Send size={14} /> Send for review</button>}
                {can.manage && v.state === 'Draft' && !t.isBase && <button className={btnDanger} onClick={() => { if (window.confirm('Throw this draft away?')) run(() => apiClient.delete(`/studio/templates/${id}/versions/${v._id}`), 'Draft removed'); }}>Discard</button>}
                {can.manage && v.state === 'Review' && <button className={btnPrimary} onClick={() => run(() => apiClient.post(`/studio/templates/${id}/versions/${v._id}/approve`, {}), 'Approved and live')}><Check size={14} /> Approve</button>}
                {can.manage && v.state === 'Review' && <button className={btnGhost} onClick={() => setAsk(v)}>Send back</button>}
                {can.manage && v.state === 'Published' && !t.isBase && <button className={btnGhost} onClick={() => run(() => apiClient.post(`/studio/templates/${id}/versions`, {}), 'New draft started')}>Change this</button>}
                {can.manage && ['Published', 'Archived'].includes(v.state) && <button className={btnGhost} onClick={() => exportIt(v)}><Download size={14} /> Export</button>}
              </div></Td>
            </Row>
          ))}
        </Tbl>
      </Card>
      {pdf.node}
      {ask && <Reason title={`Send v${ask.version} back`} label="What needs to change?" cta="Send back" min={3} onClose={() => setAsk(null)} onSubmit={async (note) => { await run(() => apiClient.post(`/studio/templates/${id}/versions/${ask._id}/reject`, { note }), 'Sent back to the author'); setAsk(null); }} />}
      {copyName !== null && <Modal title="Make a copy" onClose={() => setCopyName(null)}><Field label="Name for the copy"><input className={inputCls} value={copyName} maxLength={80} onChange={(e) => setCopyName(e.target.value)} autoFocus /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setCopyName(null)}>Cancel</button><button className={btnPrimary} disabled={!copyName.trim()} onClick={async () => { const r = await call(() => apiClient.post(`/studio/templates/${id}/duplicate`, { name: copyName }), 'Copy created'); if (r) { setCopyName(null); reloadAll(); onEdit(r.data.template._id, r.data.version._id, false); } }}>Copy and edit</button></div></Modal>}
    </div>
  );
}

function Gallery({ can, catalog, openDetail, reloadAll }) {
  const [fam, setFam] = useState(''); const [showArchived, setShowArchived] = useState(false); const [modal, setModal] = useState(null);
  const g = useGet('/studio/templates', { preview: 1 });
  const sampleValues = useMemo(() => { const o = {}; (catalog.families || []).forEach((f) => Object.entries(f.fields).forEach(([k, d]) => { if (!(k in o)) o[k] = d.sample; })); return o; }, [catalog]);
  const rows = (g.data?.templates || []).filter((t) => (!fam || t.family === fam) && (showArchived || !t.archived));
  const groups = catalog.families.map((f) => ({ f, list: rows.filter((t) => t.family === f.key) })).filter((x) => x.list.length);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputCls} !w-auto`} value={fam} onChange={(e) => setFam(e.target.value)} aria-label="Document type"><option value="">All document types</option>{catalog.families.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
        <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show retired</label>
        {can.manage && <div className="ms-auto flex gap-2"><button className={btnGhost} onClick={() => setModal('import')}><Upload size={14} /> Import</button><button className={btnPrimary} onClick={() => setModal('new')}><Plus size={14} /> New template</button></div>}
      </div>
      {g.loading && !g.data ? <Card><div className="skeleton h-48" /></Card> : g.error ? <EmptyState title={g.error} action={<button className={btnGhost} onClick={g.reload}>Try again</button>} /> : groups.length === 0 ? <EmptyState title="No templates here" text="Change the filter or start a new template." /> : groups.map(({ f, list }) => (
        <section key={f.key} aria-label={f.label}><h4 className="mb-2 text-sm font-semibold text-[#1b2837]">{f.label}</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((t) => (
              <button key={t._id} type="button" onClick={() => openDetail(t._id)} className="flex flex-col gap-2 rounded-2xl border border-[#e3e7e7] bg-white p-3 text-start transition hover:border-[#2a5cac] hover:shadow-sm">
                <div className="flex min-h-[150px] items-center justify-center overflow-hidden rounded-lg bg-[#eef0f0] p-2"><div className="max-w-full overflow-hidden"><Thumb preview={t.preview} values={sampleValues} width={t.preview?.paper?.key === 'ID-1' || t.preview?.paper?.key === 'Receipt' ? 150 : 170} /></div></div>
                <div className="min-w-0"><div className="truncate text-sm font-semibold text-[#1b2837]">{t.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1"><Pill value={t.isBase ? 'Active' : 'None'}>{t.isBase ? 'Original' : 'Ours'}</Pill>{t.liveVersion ? <Pill value="Approved">Live v{t.liveVersion}</Pill> : <Pill value="Pending">Not live</Pill>}{t.open && <Pill value="Active">{STATE_LABEL[t.open.state]} v{t.open.version}</Pill>}{t.archived && <Pill value="None">Retired</Pill>}</div></div>
              </button>
            ))}
          </div>
        </section>
      ))}
      {modal === 'new' && <NewTemplate catalog={catalog} templates={g.data?.templates || []} onClose={() => setModal(null)} onDone={(d) => { setModal(null); reloadAll(); g.reload(); openDetail(d.template._id, d.version._id); }} />}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} onDone={(d) => { setModal(null); reloadAll(); g.reload(); openDetail(d.template._id); }} />}
    </div>
  );
}

function Overview({ o, go }) {
  if (!o) return <Card><div className="skeleton h-32" /></Card>;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Templates" value={o.templates} /><Stat label="Waiting for review" value={o.inReview} tone={o.inReview ? 'text-[#b45309]' : undefined} sub={o.drafts ? `${o.drafts} draft(s) in progress` : undefined} />
        <Stat label="Issued, last 30 days" value={o.issuedLast30} /><Stat label="Withdrawn, last 30 days" value={o.revokedLast30} />
      </div>
      {o.assetsToClear > 0 && <Card className="!p-4"><div className="flex items-center gap-2 text-sm"><AlertTriangle size={16} className="text-[#b45309]" /> {o.assetsToClear} picture(s) have no confirmed licence and cannot be used on a live design. <button className="ms-auto text-[#2a5cac] underline" onClick={() => go('assets')}>Review pictures</button></div></Card>}
      {o.batchesOpen.length > 0 && <Card className="!p-4"><div className="mb-2 text-sm font-semibold">Print batches that need you</div><ul className="grid gap-1.5">{o.batchesOpen.map((b) => <li key={b._id} className="flex items-center gap-2 text-sm"><Pill value={b.status === 'NeedsAttention' ? 'Suspended' : 'Active'}>{b.status === 'NeedsAttention' ? 'Needs attention' : 'Printing'}</Pill><span>{b.name}</span><span className="text-xs text-[#5b6b7b]">{b.queued} waiting{b.failed ? `, ${b.failed} failed` : ''}</span><button className="ms-auto text-[#2a5cac] underline" onClick={() => go('print')}>Open</button></li>)}</ul></Card>}
      <Card className="!p-4 text-sm text-[#3b4a5c]"><div className="mb-1 font-semibold text-[#1b2837]">How it works</div><ol className="ms-4 list-decimal grid gap-1"><li>Pick an original design, make your copy, and change it on the canvas.</li><li>Send it for review. A second administrator approves it, and it goes live.</li><li>Issue documents from a live design. Each one gets its own number and check code, and is kept exactly as issued.</li><li>Print in batches, and record anything that jams or fails so it can be retried.</li></ol></Card>
    </div>
  );
}

export default function DocStudio() {
  const [tab, setTab] = useState('overview'); const [view, setView] = useState({ kind: 'list' }); const [editor, setEditor] = useState(null);
  const cat = useGet('/studio/catalog'); const ov = useGet('/studio/overview');
  const can = ov.data?.can || { manage: false, issue: false, print: false }; const catalog = cat.data;
  const reloadAll = useCallback(() => ov.reload(), []); // eslint-disable-line
  const openEditor = useCallback(async (templateId, versionId, readOnly) => {
    try { const r = await apiClient.get(`/studio/templates/${templateId}/versions/${versionId}`); setEditor({ ...r.data, readOnly }); } catch (e) { toast.error(errMsg(e)); }
  }, []);
  const tabs = [['overview', 'Overview', true], ['templates', 'Templates', true], ['issue', 'Issue', can.issue], ['issued', 'Issued documents', true], ['print', 'Print queue', can.print], ['assets', 'Pictures', can.manage]].filter((x) => x[2]);
  useEffect(() => { if (!tabs.find((x) => x[0] === tab)) setTab('overview'); }, [can.manage, can.issue, can.print]); // eslint-disable-line
  if (cat.error || ov.error) return <EmptyState title={cat.error || ov.error} action={<button className={btnGhost} onClick={() => { cat.reload(); ov.reload(); }}>Try again</button>} />;
  if (!catalog || !ov.data) return <Card><div className="skeleton h-48" /></Card>;
  if (editor) {
    const fam = catalog.families.find((f) => f.key === editor.template.family);
    return (
      <div className="grid gap-3"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-[#1b2837]">{editor.template.name} <span className="text-sm font-normal text-[#5b6b7b]">v{editor.version.version}{editor.readOnly ? ' · view only' : ''}</span></h3><Pill value={STATE_TONE[editor.version.state]}>{STATE_LABEL[editor.version.state]}</Pill></div>
        <CanvasEditor key={editor.version._id} template={editor.template} version={editor.version} assets={editor.assets} family={fam} readOnly={editor.readOnly} onSaved={() => reloadAll()} onClose={() => { setEditor(null); setView({ kind: 'detail', id: editor.template._id }); setTab('templates'); reloadAll(); }} /></div>
    );
  }
  return (
    <div className="grid gap-4">
      <div><h2 className="text-xl font-semibold text-[#1b2837]">Documents studio</h2><p className="text-sm text-[#5b6b7b]">ID cards, certificates, report cards, challans and letters, designed, approved, issued and printed in one place.</p></div>
      <div role="tablist" aria-label="Documents studio" className="flex flex-wrap gap-1 border-b border-[#e3e7e7]">
        {tabs.map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); if (k === 'templates') setView({ kind: 'list' }); }} className={`rounded-t-lg px-3.5 py-2.5 text-sm font-semibold ${tab === k ? 'border-b-2 border-[#2a5cac] text-[#2a5cac]' : 'text-[#5b6b7b] hover:text-[#1b2837]'}`}>{t}{k === 'templates' && ov.data.inReview ? <span className="ms-1.5 rounded-full bg-[#b45309] px-1.5 py-0.5 text-[10px] text-white">{ov.data.inReview}</span> : null}</button>)}
      </div>
      {tab === 'overview' && <Overview o={ov.data} go={setTab} />}
      {tab === 'templates' && (view.kind === 'detail' ? <TemplateDetail id={view.id} can={can} catalog={catalog} onBack={() => setView({ kind: 'list' })} onEdit={openEditor} reloadAll={reloadAll} /> : <Gallery can={can} catalog={catalog} reloadAll={reloadAll} openDetail={(id, vid) => { if (vid) openEditor(id, vid, false); else setView({ kind: 'detail', id }); }} />)}
      {tab === 'issue' && <IssueDesk catalog={catalog} onIssued={() => { reloadAll(); }} />}
      {tab === 'issued' && <IssuedList can={can} catalog={catalog} />}
      {tab === 'print' && <PrintQueue catalog={catalog} reloadAll={reloadAll} />}
      {tab === 'assets' && <AssetsDesk />}
    </div>
  );
}
