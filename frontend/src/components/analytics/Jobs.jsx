import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, inputCls, btnGhost, btnPrimary } from '../ui';
import { useGet, Loading, Note, Tabs, Tag, Status, Reason, AskForm, PageBar, dt, addDays, today } from './anKit';
import JobForm from './JobForm';

// Jobs that follow from a measure slipping: one owner, one date, one answer when it is done.
export default function Jobs({ acc }) {
  const [st, setSt] = useState('open'); const [page, setPage] = useState(1); const g = useGet('/analytics/jobs', { status: st, page }); const [mk, setMk] = useState(false); const [done, setDone] = useState(null); const [drop, setDrop] = useState(null); const [re, setRe] = useState(null); const [show, setShow] = useState(null);
  const me = acc.admin;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><Tabs label="Job state" value={st} onChange={(k) => { setSt(k); setPage(1); }} items={[['open', 'Open'], ['done', 'Done'], ['dropped', 'Cancelled']]} />{me && <button className={btnPrimary} onClick={() => setMk(true)}>New job</button>}</div>
      <Loading g={g}>{g.data && (g.data.jobs.length === 0 ? <Note tone="info">{st === 'open' ? 'No open jobs.' : 'Nothing here.'}</Note> : (
        <ul className="space-y-2">{g.data.jobs.map((j) => (
          <li key={j._id}><Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h3 className="text-sm font-bold text-[#1b2837]">{j.title}</h3>{j.detail && <p className="mt-1 text-sm text-[#3b4a5c]">{j.detail}</p>}
                <p className="mt-1 text-xs text-[#5b6b7b]">Owner {j.ownerName} · due {j.dueOn} · made by {j.createdByName}{j.groupLabel ? ` · about ${j.groupLabel}` : ''}</p>
                {j.status === 'done' && <p className="mt-1 text-xs text-[#215a52]">Finished {dt(j.doneAt)}{j.doneNote ? `: ${j.doneNote}` : ''}</p>}{j.status === 'dropped' && <p className="mt-1 text-xs text-[#5b6b7b]">Cancelled: {j.droppedReason}</p>}</div>
              <div className="flex flex-wrap items-center gap-2"><Status s={j.status} />{j.overdue && <Tag tone="bad">Late</Tag>}
                {j.status === 'open' && <><button className={btnGhost} onClick={() => setDone(j)}>Finish</button>{me && <button className={btnGhost} onClick={() => setRe(j)}>Give to someone else</button>}{me && <button className={btnGhost} onClick={() => setDrop(j)}>Cancel</button>}</>}</div>
            </div></Card></li>))}</ul>))}
      </Loading>
      {g.data && g.data.total > 20 && <PageBar page={page} total={g.data.total} limit={20} onPage={setPage} />}
      {mk && <JobForm seed={{ heading: 'New job' }} onClose={() => setMk(false)} onDone={() => { setMk(false); g.reload(); }} />}
      {done && <AskForm title={`Finish: ${done.title}`} confirm="Mark done" fields={[{ k: 'note', label: 'What was done (optional)', type: 'textarea', max: 300 }]} onClose={() => setDone(null)} onDone={async (v) => { await apiClient.post(`/analytics/jobs/${done._id}/done`, { note: v.note }); toast.success('Done.'); setDone(null); g.reload(); }} />}
      {drop && <Reason title={`Cancel: ${drop.title}`} confirm="Cancel the job" onClose={() => setDrop(null)} onDone={async (r) => { await apiClient.post(`/analytics/jobs/${drop._id}/drop`, { reason: r }); toast.success('Cancelled.'); setDrop(null); g.reload(); }} />}
      {re && <Reassign job={re} onClose={() => setRe(null)} onDone={() => { setRe(null); g.reload(); }} />}
    </div>
  );
}
function Reassign({ job, onClose, onDone }) {
  const people = useGet('/analytics/people', {});
  const opts = people.data ? [...people.data.admins.map((a) => [`admin:${a.id}`, `${a.name} (administrator)`]), ...people.data.teachers.map((a) => [`teacher:${a.id}`, `${a.name} (teacher)`])] : [];
  return <AskForm title={`Give to someone else: ${job.title}`} confirm="Move it" initial={{ owner: '', dueOn: job.dueOn }} fields={[{ k: 'owner', label: 'New owner', type: 'select', required: true, options: [['', people.loading ? 'Loading…' : 'Choose a person'], ...opts] }, { k: 'dueOn', label: 'Due by', type: 'date', min: today() }]} onClose={onClose}
    onDone={async (v) => { const [role, id] = v.owner.split(':'); await apiClient.post(`/analytics/jobs/${job._id}/reassign`, { ownerId: id, ownerRole: role, dueOn: v.dueOn || undefined }); toast.success('Moved.'); onDone(); }} />;
}
