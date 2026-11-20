import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, btnPrimary, btnGhost, btnDanger, errMsg } from '../ui';
import { useGet, call, Loading, Note, Tabs, Table, Td, TBadge, AskForm, money, day } from './tkit';

export function Coupons() {
  const g = useGet('/training/coupons'); const cs = useGet('/training/courses', { status: 'published' }); const [form, setForm] = useState(false); const rows = g.data?.coupons || [];
  return (
    <div className="space-y-3">
      <Note>A code takes money off at checkout. It is checked on the server, counted when used and given back if the order is cancelled. "Source" names who sent the buyer, so the reports can show which partner brings customers.</Note>
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setForm(true)}>New code</button></div>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No codes yet" text="Make a code for a partner, a launch or a discount for early buyers." /></Card> : (
        <Table label="Coupons" head={['Code', 'Takes off', 'Used', 'Valid', 'Source', 'Status', '']} min={760}>
          {rows.map((c) => (
            <tr key={c._id}><Td className="font-mono text-xs font-semibold">{c.code}</Td><Td>{c.kind === 'percent' ? `${c.value}%` : money(c.value)}{c.courseIds?.length ? <div className="text-[11px] text-[#5b6b7b]">{c.courseIds.length} course(s) only</div> : null}</Td><Td>{c.used}{c.maxUses ? ` / ${c.maxUses}` : ''}</Td><Td className="text-xs">{c.validFrom ? day(c.validFrom) : 'Now'} – {c.validTo ? day(c.validTo) : 'No end'}</Td><Td className="text-xs">{c.attribution || '—'}</Td><Td>{c.active ? <TBadge s="active" /> : <TBadge s="closed" />}</Td>
              <Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`${c.active ? 'Stop' : 'Start'} ${c.code}`} onClick={() => call(() => apiClient.patch(`/training/coupons/${c._id}`, { active: !c.active }), c.active ? 'Code stopped' : 'Code is on', g.reload)}>{c.active ? 'Stop' : 'Turn on'}</button></Td></tr>
          ))}
        </Table>
      )}</Loading>
      {form && <AskForm title="New code" confirm="Make the code" wide onClose={() => setForm(false)} initial={{ kind: 'percent', value: 10, maxUses: 0, courseId: '' }}
        fields={[{ k: 'code', label: 'Code (letters, numbers, - or _)', required: true, max: 24 }, { k: 'kind', label: 'Kind', type: 'select', options: [['percent', 'Percentage off'], ['amount', 'Fixed amount off']] }, { k: 'value', label: 'Value', type: 'number', min: 1, required: true }, { k: 'maxUses', label: 'Most uses (0 = no limit)', type: 'number', min: 0 }, { k: 'courseId', label: 'Only for this course (optional)', type: 'select', options: [['', 'Any course'], ...(cs.data?.courses || []).map((c) => [c._id, c.title])] }, { k: 'validTo', label: 'Last day', type: 'date' }, { k: 'attribution', label: 'Source (who sent the buyer)', max: 80 }]}
        onDone={async (v) => { await apiClient.post('/training/coupons', { code: v.code, kind: v.kind, value: Number(v.value), maxUses: Number(v.maxUses) || 0, courseIds: v.courseId ? [v.courseId] : [], validTo: v.validTo ? new Date(`${v.validTo}T23:59:59`).toISOString() : null, attribution: v.attribution }); setForm(false); g.reload(); }} />}
    </div>
  );
}

export function Bundles() {
  const g = useGet('/training/bundles'); const cs = useGet('/training/courses'); const [form, setForm] = useState(null); const rows = g.data?.bundles || []; const courses = cs.data?.courses || [];
  return (
    <div className="space-y-3">
      <Note>A bundle sells several courses together. In a learning path the courses open one after another, and finishing every course lets you issue a specialisation certificate.</Note>
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setForm({ courseIds: [] })}>New bundle</button></div>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No bundles yet" text="Group at least two published courses into a bundle or learning path." /></Card> : (
        <Table label="Bundles" head={['Bundle', 'Courses', 'Price', 'Kind', 'Status', '']} min={720}>
          {rows.map((b) => (
            <tr key={b._id}><Td className="font-medium">{b.title}</Td><Td className="text-xs">{b.courses.map((c) => c.title).join(' → ')}</Td><Td>{money(b.price)}</Td><Td className="text-xs">{b.ordered ? 'Learning path, in order' : 'Any order'}</Td><Td><TBadge s={b.status} /></Td>
              <Td><div className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Edit ${b.title}`} onClick={() => setForm({ ...b, courseIds: b.courseIds.map(String) })}>Edit</button>{b.status !== 'published' && <button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Put ${b.title} on sale`} onClick={() => call(() => apiClient.patch(`/training/bundles/${b._id}`, { status: 'published' }), 'On sale', g.reload)}>Put on sale</button>}{b.status === 'published' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Take ${b.title} off sale`} onClick={() => call(() => apiClient.patch(`/training/bundles/${b._id}`, { status: 'archived' }), 'Taken off sale', g.reload)}>Take off sale</button>}</div></Td></tr>
          ))}
        </Table>
      )}</Loading>
      {form && <BundleForm bundle={form} courses={courses} onClose={() => setForm(null)} onDone={() => { setForm(null); g.reload(); }} />}
    </div>
  );
}

function BundleForm({ bundle, courses, onClose, onDone }) {
  const [ids, setIds] = useState(bundle.courseIds || []);
  return (
    <AskForm title={bundle._id ? `Edit ${bundle.title}` : 'New bundle'} confirm="Save the bundle" wide onClose={onClose} initial={{ title: bundle.title || '', summary: bundle.summary || '', price: bundle.price || 0, ordered: !!bundle.ordered }}
      intro="Pick the courses in the order they should be taken."
      fields={[{ k: 'title', label: 'Title', required: true, full: true }, { k: 'summary', label: 'Summary', type: 'textarea', max: 400 }, { k: 'price', label: 'Bundle price before tax', type: 'number', min: 0 }, { k: 'ordered', label: 'Order', type: 'check', text: 'Learning path: each course opens after the one before is complete' }]}
      onDone={async (v) => { const body = { title: v.title, summary: v.summary, price: Number(v.price) || 0, ordered: !!v.ordered, courseIds: ids }; if (bundle._id) await apiClient.patch(`/training/bundles/${bundle._id}`, body); else await apiClient.post('/training/bundles', body); onDone(); }}
      extra={<fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">Courses</legend><div className="grid gap-1">{courses.map((c) => <label key={c._id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ids.includes(String(c._id))} onChange={(e) => setIds(e.target.checked ? [...ids, String(c._id)] : ids.filter((x) => x !== String(c._id)))} /> {c.title} {ids.includes(String(c._id)) ? <span className="text-xs text-[#5b6b7b]">(step {ids.indexOf(String(c._id)) + 1})</span> : null}</label>)}</div></fieldset>} />
  );
}
