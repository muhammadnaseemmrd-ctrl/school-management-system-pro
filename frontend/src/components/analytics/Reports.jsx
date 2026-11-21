import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, inputCls, btnGhost, btnPrimary, errMsg } from '../ui';
import { useGet, Loading, Note, Tabs, Table, Td, Tag, Status, PageBar, download, dt, Value, Sev, nf, usePeriod, PeriodBar } from './anKit';

const LEVEL = { teacher: 'A teacher view', lead: 'A curriculum lead view', admin: 'An administrator view' };
const RULES = [['last_7_days', 'The last 7 days'], ['last_30_days', 'The last 30 days'], ['last_full_month', 'The last full month'], ['month_to_date', 'The month so far']];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Saved reports are fixed once made, with the definition version they used. Wide administrators also schedule them.
export default function Reports({ acc }) {
  const [tab, setTab] = useState('runs');
  return (
    <div className="space-y-3">
      <Tabs label="Reports" value={tab} onChange={setTab} items={[['runs', 'Saved reports'], ...(acc.wide ? [['schedules', 'Scheduled reports']] : [])]} />
      {tab === 'runs' ? <Runs acc={acc} /> : <Schedules />}
    </div>
  );
}

function Runs() {
  const [page, setPage] = useState(1); const g = useGet('/analytics/runs', { page }); const [open, setOpen] = useState(null); const [mk, setMk] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[#5b6b7b]">A saved report never changes, even if a definition changes later.</p><button className={btnPrimary} onClick={() => setMk(true)}>Save a report now</button></div>
      <Loading g={g}>{g.data && (g.data.runs.length === 0 ? <Note tone="info">No saved reports yet.</Note> : (
        <Table label="Saved reports" head={['Report', 'Period', 'Made', 'Measures', 'Needs attention', '']} min={760}>
          {g.data.runs.map((r) => (
            <tr key={r._id}><Td><div className="font-medium text-[#1b2837]">{r.title}</div><div className="mt-1 flex flex-wrap gap-1"><Tag>{LEVEL[r.level] || r.level}</Tag>{r.kind === 'pack' && <Tag tone="info">Board pack</Tag>}{r.scheduleId && <Tag>Scheduled</Tag>}</div></Td>
              <Td className="whitespace-nowrap" dir="ltr">{r.from} to {r.to}</Td><Td className="whitespace-nowrap">{dt(r.createdAt)}<div className="text-xs text-[#5b6b7b]">{r.createdByName}</div></Td>
              <Td>{r.measures}</Td><Td>{r.exceptions ? <>{r.exceptions}{r.urgent ? <> <Tag tone="bad">{r.urgent} urgent</Tag></> : null}</> : 'None'}</Td>
              <Td><div className="flex gap-1"><button className={btnGhost} onClick={() => setOpen(r._id)}>Open</button><button className={btnGhost} onClick={() => download(`/analytics/runs/${r._id}/file/csv`, `aulensia-measures-${r.from}-${r.to}.csv`, toast.error)}>CSV</button><button className={btnGhost} onClick={() => download(`/analytics/runs/${r._id}/file/pdf`, `aulensia-measures-${r.from}-${r.to}.pdf`, toast.error)}>PDF</button></div></Td></tr>))}
        </Table>))}</Loading>
      {g.data && g.data.total > 20 && <PageBar page={page} total={g.data.total} limit={20} onPage={setPage} />}
      {open && <RunView id={open} onClose={() => setOpen(null)} />}
      {mk && <MakeRun onClose={() => setMk(false)} onDone={() => { setMk(false); g.reload(); }} />}
    </div>
  );
}

function RunView({ id, onClose }) {
  const g = useGet(`/analytics/runs/${id}`, {}); const r = g.data;
  return (
    <Modal title={r ? r.title : 'Report'} onClose={onClose} wide>
      <Loading g={g}>{r && (
        <div className="space-y-3 text-sm">
          <p className="text-[#3b4a5c]" dir="ltr">{r.from} to {r.to} · made {dt(r.createdAt)} by {r.createdByName}</p>
          <p className="text-xs text-[#5b6b7b]">Fingerprint {String(r.hash || '').slice(0, 16)}. It changes if any figure is changed, so a copy can be checked against this one.</p>
          {r.exceptions.length > 0 && <ul className="space-y-1">{r.exceptions.map((e, i) => <li key={i} className="flex gap-2"><Sev s={e.severity} /><span>{e.message}</span></li>)}</ul>}
          <Table label="Measures in this report" head={['Measure', 'Figure', 'Counted', 'Against', 'Version']} min={560}>
            {r.results.map((m) => (
              <React.Fragment key={m.key}>
                <tr><Td className="font-semibold text-[#1b2837]">{m.name}</Td><Td><Value t={m.total} /></Td><Td dir="ltr">{m.total.suppressed ? '—' : nf(m.total.num)}</Td><Td dir="ltr">{m.total.suppressed ? '—' : nf(m.total.den)}</Td><Td>{m.version || 'Built in'}</Td></tr>
                {(m.groups || []).map((x) => <tr key={`${m.key}-${x.key}`} className="bg-[#fafaf8]"><Td className="ps-6 text-[#3b4a5c]">{x.label}</Td><Td><Value t={x} /></Td><Td dir="ltr">{x.suppressed ? '—' : nf(x.num)}</Td><Td dir="ltr">{x.suppressed ? '—' : nf(x.den)}</Td><Td /></tr>)}
              </React.Fragment>))}
          </Table>
          {r.hidden.length > 0 && <details className="rounded-lg border border-[#e3e7e7] p-2"><summary className="cursor-pointer font-semibold">{r.hidden.length} measures were left out for this view</summary><ul className="mt-1 space-y-1 text-xs text-[#5b6b7b]">{r.hidden.map((h) => <li key={h.key}><strong>{h.name}:</strong> {h.why}</li>)}</ul></details>}
        </div>)}</Loading>
    </Modal>
  );
}

function MakeRun({ onClose, onDone }) {
  const cat = useGet('/analytics/catalog', {}); const [p, setP] = usePeriod(30); const [gb, setGb] = useState('class');
  const [v, setV] = useState({ title: '', kind: 'manual', keys: [] }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const list = cat.data ? cat.data.measures : []; const tog = (k) => setV((s) => ({ ...s, keys: s.keys.includes(k) ? s.keys.filter((x) => x !== k) : [...s.keys, k] }));
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.post('/analytics/runs', { title: v.title, kind: v.kind, keys: v.keys, from: p.from, to: p.to, groupBy: gb }); toast.success('Report saved.'); onDone(); } catch (x) { setErr(errMsg(x)); setBusy(false); } };
  return (
    <Modal title="Save a report now" onClose={onClose} wide>
      <form onSubmit={go} className="space-y-3">
        <Field label="Title"><input className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required minLength={3} maxLength={120} placeholder="Term 2 board pack" /></Field>
        <Field label="What it is"><select className={inputCls} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="manual">A report</option><option value="pack">A board pack (every measure you may see)</option></select></Field>
        <PeriodBar value={p} onChange={setP} groupBy={gb} onGroup={setGb} groups={[['class', 'Class'], ['standard', 'Grade'], ['campus', 'Campus'], ['none', 'Whole school']]} />
        {v.kind === 'manual' && <fieldset className="rounded-lg border border-[#e3e7e7] p-3"><legend className="px-1 text-sm font-semibold">Measures (none chosen means all)</legend>
          <div className="grid gap-1 sm:grid-cols-2">{list.map((m) => <label key={m.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.keys.includes(m.key)} onChange={() => tog(m.key)} /> {m.name}</label>)}</div></fieldset>}
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save report'}</button></div>
      </form>
    </Modal>
  );
}

function Schedules() {
  const g = useGet('/analytics/schedules', {}); const [edit, setEdit] = useState(null); const [busy, setBusy] = useState('');
  const act = async (id, fn, msg) => { setBusy(id); try { await fn(); toast.success(msg); g.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); } };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[#5b6b7b]">Each person gets the view their own role allows. The list shows what they will not see.</p><button className={btnPrimary} onClick={() => setEdit({})}>New scheduled report</button></div>
      <Loading g={g}>{g.data && (g.data.schedules.length === 0 ? <Note tone="info">Nothing is scheduled.</Note> : (
        <ul className="space-y-2">{g.data.schedules.map((s) => (
          <li key={s._id}><Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h3 className="text-sm font-bold text-[#1b2837]">{s.name}</h3>
                <p className="mt-1 text-xs text-[#5b6b7b]">{s.cadence === 'weekly' ? `Every ${DOW[s.dow]}` : `On day ${s.dom} of each month`} · covers {(RULES.find((r) => r[0] === s.periodRule) || [0, s.periodRule])[1].toLowerCase()} · {s.metrics.length} measures · next {s.nextDate || '—'}{s.lastRunDate ? ` · last ${s.lastRunDate}` : ''}</p>
                {s.lastError && <p role="alert" className="mt-1 text-xs text-[#9f1239]">Last run failed: {s.lastError}</p>}</div>
              <div className="flex flex-wrap items-center gap-2">{s.active ? <Tag tone="good">On</Tag> : <Tag>Paused</Tag>}
                <button className={btnGhost} disabled={busy === s._id} onClick={() => act(s._id, () => apiClient.post(`/analytics/schedules/${s._id}/run`), 'Report made.')}>Run now</button>
                <button className={btnGhost} onClick={() => setEdit(s)}>Change</button>
                <button className={btnGhost} disabled={busy === s._id} onClick={() => act(s._id, () => apiClient.patch(`/analytics/schedules/${s._id}`, { active: !s.active }), s.active ? 'Paused.' : 'Turned on.')}>{s.active ? 'Pause' : 'Turn on'}</button></div>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-[#3b4a5c]">{s.recipients.map((r) => <li key={`${r.role}${r.userId}`}><strong>{r.name}</strong> ({LEVEL[r.level] || r.role}){r.missing.length > 0 ? <span className="text-[#8a4636]"> will not see: {r.missing.join(', ')}</span> : ' sees everything chosen'}</li>)}</ul>
          </Card></li>))}</ul>))}</Loading>
      {edit && <ScheduleForm s={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); g.reload(); }} />}
    </div>
  );
}

function ScheduleForm({ s, onClose, onDone }) {
  const defs = useGet('/analytics/definitions', {}); const people = useGet('/analytics/people', {});
  const [v, setV] = useState({ name: s.name || '', metrics: s.metrics || [], cadence: s.cadence || 'weekly', dow: s.dow ?? 1, dom: s.dom ?? 1, periodRule: s.periodRule || 'last_7_days', groupBy: s.groupBy || 'class', recipients: (s.recipients || []).map((r) => `${r.role}:${r.userId}`) });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const tog = (f, k) => setV((x) => ({ ...x, [f]: x[f].includes(k) ? x[f].filter((y) => y !== k) : [...x[f], k] }));
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const body = { ...v, dow: Number(v.dow), dom: Number(v.dom), recipients: v.recipients.map((r) => { const [role, userId] = r.split(':'); return { role, userId }; }) }; if (s._id) await apiClient.patch(`/analytics/schedules/${s._id}`, body); else await apiClient.post('/analytics/schedules', body); toast.success('Saved.'); onDone(); } catch (x) { setErr(errMsg(x)); setBusy(false); } };
  const ms = (defs.data ? defs.data.measures : []).filter((m) => !m.awaiting); const pl = people.data ? [...people.data.admins.map((a) => ({ id: `admin:${a.id}`, name: `${a.name} (administrator)` })), ...people.data.teachers.map((a) => ({ id: `teacher:${a.id}`, name: `${a.name} (teacher)` }))] : [];
  return (
    <Modal title={s._id ? `Change "${s.name}"` : 'New scheduled report'} onClose={onClose} wide>
      <form onSubmit={go} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required minLength={3} maxLength={80} /></Field>
          <Field label="How often"><select className={inputCls} value={v.cadence} onChange={(e) => setV({ ...v, cadence: e.target.value })}><option value="weekly">Every week</option><option value="monthly">Every month</option></select></Field>
          {v.cadence === 'weekly' ? <Field label="On"><select className={inputCls} value={v.dow} onChange={(e) => setV({ ...v, dow: e.target.value })}>{DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
            : <Field label="Day of the month (1 to 28)"><input type="number" min={1} max={28} className={inputCls} value={v.dom} onChange={(e) => setV({ ...v, dom: e.target.value })} /></Field>}
          <Field label="It covers"><select className={inputCls} value={v.periodRule} onChange={(e) => setV({ ...v, periodRule: e.target.value })}>{RULES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
          <Field label="Break down by"><select className={inputCls} value={v.groupBy} onChange={(e) => setV({ ...v, groupBy: e.target.value })}><option value="class">Class</option><option value="standard">Grade</option><option value="campus">Campus</option><option value="none">Whole school</option></select></Field>
        </div>
        <fieldset className="rounded-lg border border-[#e3e7e7] p-3"><legend className="px-1 text-sm font-semibold">Measures</legend><div className="grid gap-1 sm:grid-cols-2">{ms.map((m) => <label key={m.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.metrics.includes(m.key)} onChange={() => tog('metrics', m.key)} /> {m.name}</label>)}</div></fieldset>
        <fieldset className="rounded-lg border border-[#e3e7e7] p-3"><legend className="px-1 text-sm font-semibold">Who receives it</legend>{people.loading ? <p className="text-sm text-[#5b6b7b]">Loading…</p> : <div className="grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">{pl.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.recipients.includes(p.id)} onChange={() => tog('recipients', p.id)} /> {p.name}</label>)}</div>}</fieldset>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy || v.metrics.length === 0 || v.recipients.length === 0}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}
