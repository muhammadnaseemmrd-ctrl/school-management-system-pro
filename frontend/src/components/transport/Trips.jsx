import React, { useState } from 'react';
import { Card, Field, EmptyState, inputCls } from '../ui';
import { useGet, Loading, Table, PageBar } from './tpKit';
import { TripRow } from './Today';
import TripDetail from './TripDetail';

export default function Trips({ manage }) {
  const [date, setDate] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null);
  const g = useGet('/transport/trips', { date: date || undefined, status: status || undefined, page, limit: 25 });
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><Field label="Day" hint="Leave empty for the last week and tomorrow"><input type="date" className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} /></Field>
        <Field label="Status"><select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="scheduled">Not started</option><option value="checked">Ready to go</option><option value="active">On the road</option><option value="completed">Finished</option><option value="cancelled">Cancelled</option><option value="missed">Did not run</option></select></Field></div></Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No trips found" text="Trips are made from the plans each day." /></Card> : <>
        <Table label="Trips" head={['Route', 'Status', 'Planned', 'Bus and driver', 'Children']} min={680}>{g.data.rows.map((t) => <TripRow key={t._id} t={t} onOpen={setOpen} />)}</Table>
        <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} /></>)}</Loading>
      {open && <TripDetail id={open} canManage={manage} onClose={() => setOpen(null)} onChange={g.reload} />}
    </div>
  );
}
