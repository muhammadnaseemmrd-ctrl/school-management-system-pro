import React, { useState } from 'react';
import { Modal, Pill, Field, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import apiClient from '../../utils/apiClient';
import { toast } from 'react-hot-toast';
import { call, useGet, hm, Loading, Note, Tabs, TYPE_LABEL, entryText, SEV_TONE } from './earlyKit';
import ChildProgress from './ChildProgress';

function Fix({ e, onClose, onDone }) {
  const [data, setData] = useState({ ...(e.data || {}) }); const [text, setText] = useState(e.text || ''); const [reason, setReason] = useState('');
  const keys = Object.keys(data).filter((k) => ['string', 'number'].includes(typeof data[k]) && !['minutes'].includes(k));
  const save = () => call(() => apiClient.post(`/early/care/${e._id}/correct`, { data, text, reason }), 'Corrected', onDone);
  const drop = () => call(() => apiClient.post(`/early/care/${e._id}/void`, { reason }), 'Removed', onDone);
  return (
    <Modal title={`Correct: ${TYPE_LABEL[e.careType]}`} onClose={onClose}>
      <div className="grid gap-3"><Note>The old entry is kept and marked as replaced, with your reason.</Note>
        {keys.map((k) => <Field key={k} label={k}><input className={inputCls} value={data[k]} onChange={(ev) => setData({ ...data, [k]: ev.target.value })} /></Field>)}
        <Field label="Words"><input className={inputCls} value={text} onChange={(ev) => setText(ev.target.value)} /></Field>
        <Field label="Why is it being changed?"><input className={inputCls} value={reason} onChange={(ev) => setReason(ev.target.value)} /></Field>
        <div className="flex justify-between gap-2"><button className={btnDanger} disabled={reason.trim().length < 3} onClick={drop}>Remove it</button><div className="flex gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={reason.trim().length < 3} onClick={save}>Save correction</button></div></div></div>
    </Modal>
  );
}

function Day({ child }) {
  const g = useGet(`/early/children/${child._id}/timeline`); const [fix, setFix] = useState(null); const [talk, setTalk] = useState(null); const [who, setWho] = useState(''); const d = g.data;
  return (
    <Loading g={g}>{d && (
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2 text-sm"><Pill value="Approved">{d.summary.meals} meals</Pill><Pill value="Approved">{d.summary.napMinutes} min asleep</Pill><Pill value="Approved">{d.summary.toilet} toilet</Pill></div>
        {d.entries.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing recorded today.</p> : (
          <ul className="divide-y divide-[#e3e7e7] rounded-xl border border-[#e3e7e7] bg-white">{d.entries.map((e) => (
            <li key={e._id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${e.state === 'Voided' ? 'opacity-50' : ''}`}>
              <span className="w-12 text-xs text-[#5b6b7b]">{e.time}</span><Pill value="None">{TYPE_LABEL[e.careType]}</Pill>
              <span className={`min-w-[10rem] flex-1 text-sm ${e.state === 'Voided' ? 'line-through' : ''}`}>{entryText(e)}</span>
              {e.shared && <Pill value="Active">In family diary</Pill>}{e.state === 'Voided' && <span className="text-xs">{e.voidReason}</span>}
              {e.state === 'Active' && e.careType === 'behavior' && (e.discussedAt ? <Pill value="Approved">Talked over with {e.discussedWith}</Pill> : <button className={btnGhost} onClick={() => { setTalk(e); setWho(''); }}>Talked it over with the family</button>)}
              {e.state === 'Active' && <button className={btnGhost} onClick={() => setFix(e)}>Correct</button>}
            </li>))}</ul>)}
        {fix && <Fix e={fix} onClose={() => setFix(null)} onDone={() => { setFix(null); g.reload(); }} />}
        {talk && <Modal title="Talked it over" onClose={() => setTalk(null)}><div className="grid gap-3"><Note>Record who in the family you spoke to. After this the note can go in the diary.</Note><Field label="Who did you talk to?"><input className={inputCls} value={who} onChange={(e) => setWho(e.target.value)} /></Field><div className="flex justify-end"><button className={btnPrimary} disabled={who.trim().length < 2} onClick={() => call(() => apiClient.post(`/early/care/${talk._id}/discussed`, { with: who }), 'Recorded', () => { setTalk(null); g.reload(); })}>Save</button></div></div></Modal>}
      </div>)}</Loading>
  );
}

function Profile({ child, isLead }) {
  const g = useGet(`/early/children/${child._id}/profile`); const [f, setF] = useState(null); const [conf, setConf] = useState(''); const [busy, setBusy] = useState(false); const [dec, setDec] = useState({});
  const d = g.data; const p = f || (d && { allergies: d.profile.allergies, diet: d.profile.diet, medicalAlert: d.profile.medicalAlert, emergencyContacts: d.profile.emergencyContacts, comfort: d.profile.comfort, supports: d.profile.supports });
  const upd = (k, v) => setF({ ...p, [k]: v }); const row = (k, i, patch) => upd(k, p[k].map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const save = async () => { setBusy(true); const r = await call(() => apiClient.put(`/early/children/${child._id}/profile`, { ...p, confirmedWith: conf }), 'Saved', () => { setF(null); setConf(''); g.reload(); }); (r?.data?.warnings || []).forEach((w) => toast(w, { duration: 7000 })); setBusy(false); };
  const decide = (pid, decision) => call(() => apiClient.post(`/early/children/${child._id}/profile/pending/${pid}`, { decision, confirmedWith: dec[pid] || '', note: decision === 'decline' ? (dec[pid] || 'Not added') : '' }), decision === 'apply' ? 'Added' : 'Declined', g.reload);
  const sec = (title, body) => <section className="rounded-xl border border-[#e3e7e7] bg-white p-3"><h4 className="mb-2 text-sm font-bold">{title}</h4>{body}</section>;
  return (
    <Loading g={g}>{d && (
      <div className="grid gap-3">
        {d.pending.length > 0 && <Note tone="warn"><div className="font-semibold">The family sent an update. Check it with them before adding it.</div>{d.pending.map((x) => (
          <div key={x._id} className="mt-2 rounded-lg bg-white p-2 text-[#1b2837]"><div className="text-xs">From {x.byName}</div><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(x.proposal, null, 1)}</pre>
            {isLead && <div className="mt-1 flex flex-wrap items-center gap-2"><input className={`${inputCls} max-w-[16rem]`} placeholder="Who you confirmed it with (or why declined)" value={dec[x._id] || ''} onChange={(e) => setDec({ ...dec, [x._id]: e.target.value })} aria-label="Confirmed with" /><button className={btnPrimary} disabled={(dec[x._id] || '').trim().length < 2} onClick={() => decide(x._id, 'apply')}>Add it</button><button className={btnGhost} disabled={(dec[x._id] || '').trim().length < 3} onClick={() => decide(x._id, 'decline')}>Do not add</button></div>}</div>))}</Note>}
        {sec('Allergies', <div className="grid gap-2">{p.allergies.map((a, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_2fr_auto]"><input className={inputCls} aria-label="Allergy" value={a.what} onChange={(e) => row('allergies', i, { what: e.target.value })} /><select className={inputCls} aria-label="Severity" value={a.severity} onChange={(e) => row('allergies', i, { severity: e.target.value })}>{['mild', 'moderate', 'severe'].map((s) => <option key={s}>{s}</option>)}</select><input className={inputCls} aria-label="What to do" placeholder="What carers do" value={a.action} onChange={(e) => row('allergies', i, { action: e.target.value })} /><button className={btnGhost} onClick={() => upd('allergies', p.allergies.filter((_, j) => j !== i))}>Remove</button></div>)}<button className={`${btnGhost} justify-self-start`} onClick={() => upd('allergies', [...p.allergies, { what: '', severity: 'moderate', action: '' }])}>Add an allergy</button></div>)}
        {sec('Food and alerts', <div className="grid gap-2 sm:grid-cols-2"><Field label="Diet"><input className={inputCls} value={p.diet} onChange={(e) => upd('diet', e.target.value)} /></Field><Field label="Medical alert" hint="Say what carers should do, not a diagnosis."><input className={inputCls} value={p.medicalAlert} onChange={(e) => upd('medicalAlert', e.target.value)} /></Field></div>)}
        {sec('Emergency contacts', <div className="grid gap-2">{p.emergencyContacts.map((c, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"><input className={inputCls} aria-label="Name" placeholder="Name" value={c.name} onChange={(e) => row('emergencyContacts', i, { name: e.target.value })} /><input className={inputCls} aria-label="Relationship" placeholder="Relationship" value={c.relationship} onChange={(e) => row('emergencyContacts', i, { relationship: e.target.value })} /><input className={inputCls} aria-label="Phone" inputMode="tel" placeholder="Phone" value={c.phone} onChange={(e) => row('emergencyContacts', i, { phone: e.target.value })} /><button className={btnGhost} onClick={() => upd('emergencyContacts', p.emergencyContacts.filter((_, j) => j !== i))}>Remove</button></div>)}{p.emergencyContacts.length < 5 && <button className={`${btnGhost} justify-self-start`} onClick={() => upd('emergencyContacts', [...p.emergencyContacts, { name: '', relationship: '', phone: '' }])}>Add a contact</button>}</div>)}
        {sec('What helps', <div className="grid gap-2"><Field label="Comfort"><input className={inputCls} value={p.comfort} onChange={(e) => upd('comfort', e.target.value)} /></Field>{p.supports.map((s, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><input className={inputCls} aria-label="When" placeholder="When it is needed" value={s.situation} onChange={(e) => row('supports', i, { situation: e.target.value })} /><input className={inputCls} aria-label="What helps" placeholder="What helps" value={s.support} onChange={(e) => row('supports', i, { support: e.target.value })} /><button className={btnGhost} onClick={() => upd('supports', p.supports.filter((_, j) => j !== i))}>Remove</button></div>)}<button className={`${btnGhost} justify-self-start`} onClick={() => upd('supports', [...p.supports, { situation: '', support: '' }])}>Add a support</button></div>)}
        {f && <div className="grid gap-2 rounded-xl bg-[#f7f6f2] p-3"><Field label="Confirmed with (a member of the family)" hint="Required when allergies, diet, alerts or emergency contacts change."><input className={inputCls} value={conf} onChange={(e) => setConf(e.target.value)} /></Field><div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setF(null)}>Discard</button><button className={btnPrimary} disabled={busy} onClick={save}>Save profile</button></div></div>}
        {d.profile.confirmedAt && <p className="text-xs text-[#5b6b7b]">Last confirmed {new Date(d.profile.confirmedAt).toLocaleDateString('en-GB')} with {d.profile.confirmedWith} by {d.profile.confirmedByName}.</p>}
      </div>)}</Loading>
  );
}

function Consent({ child, isLead }) {
  const g = useGet(`/early/children/${child._id}/profile`); const [conf, setConf] = useState(''); const [v, setV] = useState(null); const c = v || g.data?.profile.consent;
  return (
    <Loading g={g}>{c && (
      <div className="grid gap-3"><Note>Consent decides what the family sees. Photos only ever appear in an entry that someone else has reviewed, and only for a child whose family has agreed.</Note>
        {[['journal', 'Daily diary'], ['photos', 'Photos in diary entries'], ['portfolio', 'Learning portfolio']].map(([k, label]) => <label key={k} className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={!isLead} checked={!!c[k]} onChange={(e) => setV({ ...c, [k]: e.target.checked })} /> {label}</label>)}
        <p className="text-xs text-[#5b6b7b]">{g.data.profile.consent.setAt ? `Last set by ${g.data.profile.consent.setByName} (${g.data.profile.consent.source}).` : 'Not set yet: the diary is on, photos and portfolio are off.'}</p>
        {isLead && v && <><Field label="Which member of the family agreed, and how?"><input className={inputCls} value={conf} onChange={(e) => setConf(e.target.value)} placeholder="Mother, signed form" /></Field><div className="flex justify-end"><button className={btnPrimary} disabled={conf.trim().length < 2} onClick={() => call(() => apiClient.put(`/early/children/${child._id}/consent`, { ...v, confirmedWith: conf }), 'Saved', () => { setV(null); setConf(''); g.reload(); })}>Save consent</button></div></>}
        {!isLead && <Note>Only the room lead or an administrator can record consent for a family.</Note>}
      </div>)}</Loading>
  );
}

export default function ChildSheet({ child, roomId, isLead, onClose, onChanged }) {
  const [tab, setTab] = useState('day');
  return (
    <Modal title={child.name} onClose={() => { onClose(); onChanged && onChanged(); }} wide>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#5b6b7b]">{child.age}{child.allergy && <Pill value={SEV_TONE[child.allergy]}>Allergy: {child.allergy}</Pill>}</div>
        <Tabs label="Child" value={tab} onChange={setTab} items={[['day', 'Today'], ['safety', 'Safety profile'], ['consent', 'Consent'], ['learning', 'Learning']]} />
        {tab === 'day' && <Day child={child} />}{tab === 'safety' && <Profile child={child} isLead={isLead} />}{tab === 'consent' && <Consent child={child} isLead={isLead} />}{tab === 'learning' && <ChildProgress childId={child._id} />}
      </div>
    </Modal>
  );
}
