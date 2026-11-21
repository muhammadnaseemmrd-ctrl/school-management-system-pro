import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { btnPrimary, btnGhost, btnDanger, Field, inputCls, Card } from '../ui';
import apiClient from '../../utils/apiClient';
import { useGet, Tabs, Loading, Note, Table, Td, Tag, AskForm, Reason, ShowOnce, download, dt, send, Empty, tone, lines, Tile, Grid } from './advKit';

const CH = [['email', 'Email'], ['phone', 'Phone']];

function List({ ver, bump }) {
  const [state, setState] = useState(''); const [q, setQ] = useState(''); const g = useGet('/advancement/alumni', { state: state || undefined, q: q || undefined, v: ver }); const [m, setM] = useState(null); const [shown, setShown] = useState(null);
  const link = async (a) => { const r = await send('post', `/alumni/${a.id}/link`, {}); setShown({ title: `Private link for ${a.name}`, secret: `${window.location.origin}/alumni/${r.link.token}` }); bump(); };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3"><Field label="Search"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" /></Field><Field label="Show"><select className={inputCls} value={state} onChange={(e) => setState(e.target.value)}><option value="">All</option>{['Invited', 'Active', 'Withdrawn', 'Erased'].map((s) => <option key={s}>{s}</option>)}</select></Field></div>
        <div className="flex gap-2"><button className={btnGhost} onClick={() => setM({ t: 'bulk' })}>Add a list</button><button className={btnPrimary} onClick={() => setM({ t: 'add' })}>Add a graduate</button></div>
      </div>
      <Note>Contact details are kept only while a graduate says yes, and only for the channels they chose. Each graduate gets a private link to answer for themselves.</Note>
      <Loading g={g}>{g.data && (g.data.alumni.length === 0 ? <Empty>No graduates yet.</Empty> : (
        <Table label="Graduates" head={['Name', 'Year', 'State', 'Agreed to', 'Contact', '']} min={820}>
          {g.data.alumni.map((a) => <tr key={a.id}><Td><span className="font-semibold">{a.name}</span>{a.classLabel && <span className="block text-xs text-[#5b6b7b]">{a.classLabel}</span>}</Td><Td>{a.gradYear}</Td><Td><Tag tone={tone(a.state)}>{a.state}</Tag></Td>
            <Td className="text-xs">{a.consent.contact ? `Contact by ${a.consent.channels.join(' and ') || '—'}` : 'No contact'}{a.consent.events ? ' · events' : ''}{a.consent.directory === 'visible' ? ' · in the directory' : ''}{a.consent.source === 'staff' ? ' · recorded by staff' : ''}</Td>
            <Td className="text-xs">{a.contact ? [a.contact.email, a.contact.phone].filter(Boolean).join(' · ') || '—' : '—'}</Td>
            <Td>{['Invited', 'Active'].includes(a.state) && <div className="flex flex-wrap gap-2"><button className={btnGhost} onClick={() => link(a)} aria-label={`New private link for ${a.name}`}>New link</button><button className={btnGhost} onClick={() => setM({ t: 'consent', a })} aria-label={`Record consent for ${a.name}`}>Record what they said</button><button className={btnDanger} onClick={() => setM({ t: 'erase', a })} aria-label={`Erase ${a.name}`}>Erase</button></div>}</Td></tr>)}
        </Table>))}</Loading>
      {m?.t === 'add' && <AskForm title="Add a graduate" intro="If they were a student here, choose them from the leavers by giving the record. A student who is still enrolled cannot be added." fields={[{ k: 'name', label: 'Full name', required: true }, { k: 'gradYear', label: 'Year they left', type: 'number', required: true, min: 1950, max: new Date().getFullYear() }, { k: 'classLabel', label: 'Last class (for example 10-A)' }]} onClose={() => setM(null)} onDone={async (v) => { const r = await send('post', '/alumni', { ...v, gradYear: Number(v.gradYear) }, 'Added'); setM(null); setShown({ title: `Private link for ${r.alumnus.name}`, secret: `${window.location.origin}/alumni/${r.link.token}` }); bump(); }} />}
      {m?.t === 'bulk' && <AskForm title="Add a list of graduates" intro="One per line: name, year, last class (the class is optional). Up to 200. Each gets a private link that is shown once." fields={[{ k: 'rows', label: 'Graduates', type: 'textarea', required: true, ph: 'Ali Raza, 2020, 10-A' }]} onClose={() => setM(null)} onDone={async (v) => { const rows = lines(v.rows).map((l) => { const [name, year, classLabel] = l.split(',').map((x) => x.trim()); return { name, gradYear: Number(year), classLabel: classLabel || '' }; }); const r = await send('post', '/alumni/bulk', { rows }, `${rows.length} read`); setM(null); setShown({ title: `${r.added} added${r.failed.length ? `, ${r.failed.length} could not be added` : ''}`, secret: [...r.links.map((l) => `${l.name}: ${window.location.origin}/alumni/${l.token}`), ...r.failed.map((f) => `NOT ADDED (row ${f.row}): ${f.message}`)].join('\n') }); bump(); }} />}
      {m?.t === 'consent' && <AskForm title={`What ${m.a.name} said`} intro="Use this only when they told you themselves. Say how you were told. It is marked as recorded by staff." fields={[{ k: 'contact', label: 'May we contact them?', type: 'check', text: 'Yes, they agreed to be contacted' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'phone', label: 'Phone' }, { k: 'events', label: 'Events', type: 'check', text: 'They agreed to hear about events' }, { k: 'how', label: 'How they told you, and when', type: 'textarea', required: true }]} initial={{ contact: m.a.consent.contact, email: m.a.contact?.email, phone: m.a.contact?.phone, events: m.a.consent.events }} onClose={() => setM(null)} onDone={async (v) => { const channels = [v.email && 'email', v.phone && 'phone'].filter(Boolean); await send('put', `/alumni/${m.a.id}/consent`, { contact: !!v.contact, channels: v.contact ? channels : [], email: v.email, phone: v.phone, events: !!v.events, directory: m.a.consent.directory, how: v.how }, 'Saved'); setM(null); bump(); }} />}
      {m?.t === 'erase' && <Reason title={`Erase ${m.a.name}`} text="Everything about this graduate is removed. Only a blank row stays. This cannot be undone." confirm="Erase" onClose={() => setM(null)} onDone={async () => { await send('post', `/alumni/${m.a.id}/erase`, {}, 'Erased'); setM(null); bump(); }} />}
      {shown && <ShowOnce title={shown.title} text="Send the link to the graduate yourself. It is shown only now and cannot be looked up again. You can make a new one at any time, and the old one stops working." secret={shown.secret} onClose={() => setShown(null)} />}
    </div>
  );
}

function Audience() {
  const [ch, setCh] = useState('email'); const [purpose, setPurpose] = useState(''); const g = useGet('/advancement/alumni/audience', { channel: ch, purpose: purpose || undefined });
  return <div className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><div className="flex gap-3"><Field label="Channel"><select className={inputCls} value={ch} onChange={(e) => setCh(e.target.value)}>{CH.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field><Field label="For"><select className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)}><option value="">Anything they agreed to</option><option value="events">Events only</option></select></Field></div><button className={btnGhost} onClick={() => download(`/advancement/alumni/audience?channel=${ch}&format=csv${purpose ? `&purpose=${purpose}` : ''}`, 'alumni-audience.csv')}>Download as a spreadsheet</button></div>
    <Note>Only graduates who agreed to this channel are listed. The school sends the message itself: nothing is sent from here.</Note>
    <Loading g={g}>{g.data && <><p className="text-sm text-[#3b4a5c]" role="status">{g.data.count} of {g.data.of} graduates agreed.</p>{g.data.people.length === 0 ? <Empty>Nobody has agreed yet.</Empty> : <Table label="Mailing list" head={['Name', 'Year', ch === 'email' ? 'Email' : 'Phone']} min={520}>{g.data.people.map((p, i) => <tr key={i}><Td>{p.name}</Td><Td>{p.gradYear}</Td><Td><span dir="ltr">{p[ch]}</span></Td></tr>)}</Table>}</>}</Loading></div>;
}
function Directory() { const g = useGet('/advancement/alumni/directory'); return <Loading g={g}>{g.data && (<div className="space-y-3"><Note>Only graduates who chose to be listed appear here, with only what they wrote.</Note>{g.data.people.length === 0 ? <Empty>Nobody has chosen to be listed yet.</Empty> : <Table label="Alumni directory" head={['Name', 'Year', 'City', 'Work', 'Field']} min={620}>{g.data.people.map((p, i) => <tr key={i}><Td>{p.name}</Td><Td>{p.gradYear}</Td><Td>{p.city || '—'}</Td><Td>{[p.headline, p.employer].filter(Boolean).join(' · ') || '—'}</Td><Td>{p.field || '—'}</Td></tr>)}</Table>}</div>)}</Loading>; }
function Employment() {
  const g = useGet('/advancement/alumni/employment');
  return <Loading g={g}>{g.data && (<div className="space-y-3"><Note>{g.data.note}</Note>{g.data.answers && ['status', 'sector'].map((k) => <Card key={k}><h2 className="text-sm font-bold text-[#1b2837]">{k === 'status' ? 'What graduates are doing' : 'Where they work'}</h2><ul className="mt-2 space-y-1 text-sm">{g.data.answers[k].shown.map((x) => <li key={x.label} className="flex justify-between"><span>{x.label}</span><b className="tabular-nums" dir="ltr">{x.count}</b></li>)}</ul>{g.data.answers[k].hidden && <p className="mt-2 text-xs text-[#5b6b7b]">Smaller groups are hidden so nobody can be picked out.</p>}</Card>)}{g.data.total !== null && g.data.total !== undefined && <p className="text-sm text-[#3b4a5c]">{g.data.total} graduates answered.</p>}</div>)}</Loading>;
}
function Rsvps({ e, onClose }) {
  const rs = useGet(`/advancement/events/${e._id}/rsvps`, {});
  return <div className="rounded-xl border border-[#e3e7e7] bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">{e.title}: who answered</h2><button className={btnGhost} onClick={onClose}>Close</button></div><Loading g={rs}>{rs.data && (rs.data.rsvps.length === 0 ? <p className="mt-2 text-sm text-[#5b6b7b]">Nobody yet.</p> : <ul className="mt-2 text-sm">{rs.data.rsvps.map((x, i) => <li key={i}>{x.name} · {x.status}</li>)}</ul>)}</Loading></div>;
}

function Events({ ver, bump }) {
  const g = useGet('/advancement/events', { v: ver }); const [m, setM] = useState(null); const [r, setR] = useState(null);
  const form = (e) => [{ k: 'title', label: 'Title', required: true }, { k: 'startsAt', label: 'Starts', type: 'datetime-local', required: true }, { k: 'place', label: 'Place' }, { k: 'capacity', label: 'Places (leave empty for no limit)', type: 'number', min: 1 }, { k: 'description', label: 'About', type: 'textarea' }];
  const body = (v) => ({ title: v.title, startsAt: new Date(v.startsAt).toISOString(), place: v.place, description: v.description, capacity: v.capacity ? Number(v.capacity) : null });
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({ t: 'new' })}>New event</button></div>
      <Loading g={g}>{g.data && (g.data.events.length === 0 ? <Empty>No events yet.</Empty> : (
        <Table label="Alumni events" head={['Event', 'When', 'Status', 'Answers', '']} min={760}>
          {g.data.events.map((e) => <tr key={e._id}><Td><span className="font-semibold">{e.title}</span><span className="block text-xs text-[#5b6b7b]">{e.place}</span></Td><Td>{dt(e.startsAt)}</Td><Td><Tag tone={tone(e.status)}>{e.status}</Tag></Td><Td className="text-xs">{e.rsvp ? `${e.rsvp.going} going · ${e.rsvp.maybe} maybe${e.capacity ? ` · of ${e.capacity} places` : ''}` : '—'}</Td>
            <Td><div className="flex flex-wrap gap-2">{e.status === 'Draft' && <><button className={btnGhost} onClick={() => setM({ t: 'edit', e })} aria-label={`Edit ${e.title}`}>Edit</button><button className={btnPrimary} onClick={async () => { await send('post', `/events/${e._id}/status`, { status: 'Published' }, 'Published to graduates'); bump(); }} aria-label={`Publish ${e.title}`}>Publish</button></>}{e.status === 'Published' && <button className={btnGhost} onClick={async () => { await send('post', `/events/${e._id}/status`, { status: 'Closed' }, 'Closed'); bump(); }} aria-label={`Close ${e.title}`}>Close</button>}<button className={btnGhost} onClick={() => setR(e)} aria-label={`Answers for ${e.title}`}>Who answered</button></div></Td></tr>)}
        </Table>))}</Loading>
      {m && <AskForm title={m.t === 'new' ? 'New event' : 'Change the event'} fields={form()} initial={m.e ? { ...m.e, startsAt: m.e.startsAt ? new Date(new Date(m.e.startsAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' } : {}} onClose={() => setM(null)} onDone={async (v) => { if (m.t === 'new') await send('post', '/events', body(v), 'Saved as a draft'); else await send('put', `/events/${m.e._id}`, body(v), 'Saved'); setM(null); bump(); }} />}
      {r && <Rsvps e={r} onClose={() => setR(null)} />}
    </div>
  );
}

export default function Alumni() {
  const [tab, setTab] = useState('list'); const [ver, setVer] = useState(0); const bump = () => setVer((x) => x + 1);
  return <div className="space-y-4"><Tabs label="Alumni sections" value={tab} onChange={setTab} items={[['list', 'Graduates'], ['events', 'Events'], ['audience', 'Mailing lists'], ['directory', 'Directory'], ['employment', 'What they do']]} />
    <div key={tab}>{tab === 'list' && <List ver={ver} bump={bump} />}{tab === 'events' && <Events ver={ver} bump={bump} />}{tab === 'audience' && <Audience />}{tab === 'directory' && <Directory />}{tab === 'employment' && <Employment />}</div></div>;
}
