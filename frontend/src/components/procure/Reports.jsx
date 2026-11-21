import React, { useState } from 'react';
import { Card, Stat, Field, btnGhost, inputCls } from '../ui';
import { Table, Td, PBadge, useGet, Loading, download, money, day } from './pcKit';

const REPORTS = [['budget', 'Budget against spending'], ['funds', 'Funds'], ['pipeline', 'Requests and orders'], ['payables', 'Unpaid bills'], ['projects', 'Projects'], ['assets', 'Asset register'], ['vendors', 'Spending by supplier'], ['contracts', 'Running costs forecast']];

function View({ name, d }) {
  if (name === 'budget') return (<><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Budget" value={money(d.totals.amount)} /><Stat label="Set aside" value={money(d.totals.committed)} /><Stat label="Spent" value={money(d.totals.spent)} /><Stat label="Left" value={money(d.totals.available)} /></div>
    <Table label="Budget against spending" head={['Cost centre', 'Category', 'Budget', 'Set aside', 'Spent', 'Left', 'Used']} min={760}>{d.rows.map((r, i) => <tr key={i}><Td>{r.costCentre}</Td><Td className="font-medium">{r.category}</Td><Td>{money(r.amount)}</Td><Td>{money(r.committed)}</Td><Td>{money(r.spent)}</Td><Td>{money(r.available)}</Td><Td>{r.usedPercent}%</Td></tr>)}</Table></>);
  if (name === 'funds') return <Table label="Funds" head={['Fund', 'Kind', 'Received', 'Set aside', 'Spent', 'Left']} min={640}>{d.rows.map((r) => <tr key={r._id}><Td className="font-medium">{r.name}</Td><Td>{r.kind}</Td><Td>{money(r.received)}</Td><Td>{money(r.committed)}</Td><Td>{money(r.spent)}</Td><Td>{money(r.available)}</Td></tr>)}</Table>;
  if (name === 'pipeline') return (<div className="grid gap-3 sm:grid-cols-2"><Table label="Requests by status" head={['Requests', 'How many', 'Value']} min={300}>{d.requisitions.map((r) => <tr key={r.status}><Td><PBadge k="req" s={r.status} /></Td><Td>{r.count}</Td><Td>{money(r.value)}</Td></tr>)}</Table><Table label="Orders by status" head={['Orders', 'How many', 'Value', 'Paid']} min={340}>{d.orders.map((r) => <tr key={r.status}><Td><PBadge k="order" s={r.status} /></Td><Td>{r.count}</Td><Td>{money(r.value)}</Td><Td>{money(r.paid)}</Td></tr>)}</Table></div>);
  if (name === 'payables') return (<><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[['Not due yet', d.buckets.current], ['1 to 30 days late', d.buckets.d1_30], ['31 to 60 days late', d.buckets.d31_60], ['Over 60 days late', d.buckets.d61_plus], ['No due date', d.buckets.nodue]].map(([l, v]) => <Stat key={l} label={l} value={money(v)} />)}</div>
    <Table label="Unpaid bills" head={['Bill', 'Supplier', 'Amount', 'Due', 'Days late', 'Status']} min={680}>{d.rows.map((r) => <tr key={r._id}><Td className="font-mono text-xs">{r.billNo}</Td><Td>{r.vendorName}</Td><Td>{money(r.amount)}</Td><Td>{day(r.dueOn)}</Td><Td>{r.daysLate}</Td><Td><PBadge k="bill" s={r.status} /></Td></tr>)}</Table></>);
  if (name === 'projects') return <Table label="Projects" head={['Project', 'Phase', 'May spend', 'Set aside', 'Spent', 'Left']} min={680}>{d.rows.map((r) => <tr key={r._id}><Td className="font-medium">{r.title}<div className="font-mono text-[11px] text-[#5b6b7b]">{r.code}</div></Td><Td><PBadge k="phase" s={r.phase} /></Td><Td>{money(r.authorized)}</Td><Td>{money(r.committed)}</Td><Td>{money(r.spent)}</Td><Td>{money(r.available)}</Td></tr>)}</Table>;
  if (name === 'assets') return (<><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Assets" value={d.totals.count} /><Stat label="Cost" value={money(d.totals.cost)} /><Stat label="Lost in value" value={money(d.totals.accumulated)} /><Stat label="Worth now" value={money(d.totals.book)} sub={`on ${day(d.asOf)}`} /></div>
    <Table label="Assets by kind" head={['Kind', 'Count', 'Cost', 'Lost in value', 'Worth now']} min={520}>{d.categories.map((c) => <tr key={c.category}><Td className="font-medium">{c.category}</Td><Td>{c.count}</Td><Td>{money(c.cost)}</Td><Td>{money(c.accumulated)}</Td><Td>{money(c.book)}</Td></tr>)}</Table></>);
  if (name === 'vendors') return <Table label="Spending by supplier" head={['Supplier', 'Bills paid', 'Paid after credits']} min={420}>{d.rows.map((r) => <tr key={r.vendorId}><Td className="font-medium">{r.vendor}</Td><Td>{r.bills}</Td><Td>{money(r.paid)}</Td></tr>)}</Table>;
  return (<><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat label="Next 12 months" value={money(d.total)} /><Stat label="Contracts" value={d.contracts} /></div><Table label="By month" head={['Month', 'Amount']} min={300}>{d.months.map((m) => <tr key={m.month}><Td>{m.month}</Td><Td>{money(m.amount)}</Td></tr>)}</Table></>);
}

function Report({ name }) {
  const g = useGet(`/procure/reports/${name}`);
  return <Loading g={g}>{g.data && <div className="space-y-3"><View name={name} d={g.data} /></div>}</Loading>;
}

export default function Reports() {
  const [name, setName] = useState('budget');
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3"><Field label="Report"><select className={inputCls} value={name} onChange={(e) => setName(e.target.value)}>{REPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>{!['pipeline', 'contracts'].includes(name) && <button className={btnGhost} onClick={() => download(`/procure/reports/${name}?format=csv`, `${name}.csv`)}>Download as a spreadsheet</button>}</div></Card>
      <Report key={name} name={name} />
    </div>
  );
}
