// Money across the group: what was billed, what came in, what went out, school by school.
//
// What is deliberately not here: any one child's fee record. A head office works from totals and
// the schools' own expense lines; the names behind an unpaid fee stay with the school.

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ChevronLeft, Loader2, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Stat, btnGhost, errMsg } from '../ui';

const PERIODS = [
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'Last 12 months' },
  { key: 'all', label: 'Everything' },
];

// Rupees, written the way a Pakistani office writes them.
const rs = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// A bar that reads at a glance: how much of what was billed actually came in.
const Collected = ({ billed, collected }) => {
  const p = Math.min(100, pct(collected, billed));
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-[#e3e7e7]" role="img" aria-label={`${p} per cent of what was billed has been collected`}>
        <div className="h-full rounded-full bg-[#1f5e53] transition-all" style={{ width: `${p}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-[#5b6b7b]">{p}% of what was billed</p>
    </div>
  );
};

/* ── one school, in more detail ── */
function SchoolFinance({ id, period, onBack }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    setD(null);
    apiClient.get(`/director/schools/${id}/finance`, { params: { period } })
      .then((r) => setD(r.data))
      .catch((e) => toast.error(errMsg(e, 'Could not open that school')));
  }, [id, period]);

  if (!d) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#2a5cac]" /></div>;

  const peak = Math.max(1, ...d.months.map((m) => Math.max(m.billed, m.collected, m.payroll + m.supplies)));

  return (
    <div className="space-y-5">
      <button type="button" className={btnGhost} onClick={onBack}><ChevronLeft className="h-4 w-4" /> All schools</button>

      <div>
        <h3 className="text-xl font-black text-[#1b2837]">{d.school.name}</h3>
        <p className="text-sm text-[#5b6b7b]">{d.period.label} · code <span className="font-mono">{d.school.code}</span></p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Fees collected" value={rs(d.fees.collected)} sub={`of ${rs(d.fees.billed)} billed`} tone="text-[#1f5e53]" />
        <Stat label="Still owed" value={rs(d.fees.outstanding)} sub={d.fees.overdue ? `${rs(d.fees.overdue)} past its due date` : 'nothing overdue'} tone={d.fees.overdue ? 'text-[#9f1239]' : undefined} />
        <Stat label="Spent" value={rs(d.expenses.total)} sub={`${rs(d.expenses.payroll)} salaries · ${rs(d.expenses.supplierBills)} suppliers`} />
        <Stat label="Left over" value={rs(d.net)} sub="collected minus spent" tone={d.net < 0 ? 'text-[#9f1239]' : 'text-[#1f5e53]'} />
      </div>

      {!!d.months.length && (
        <Card>
          <h4 className="font-bold text-[#1b2837]">Month by month</h4>
          <p className="text-xs text-[#5b6b7b]">Green is what came in. Grey is what went out, salaries and suppliers together.</p>
          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-[32rem] items-end gap-3" style={{ height: 180 }}>
              {d.months.map((m) => {
                const out = m.payroll + m.supplies;
                return (
                  <div key={m.month} className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-1">
                    <div className="flex h-[140px] w-full items-end justify-center gap-1">
                      <div className="w-1/2 rounded-t bg-[#1f5e53]" style={{ height: `${Math.round((m.collected / peak) * 140)}px` }} title={`${m.month}: ${rs(m.collected)} in`} />
                      <div className="w-1/2 rounded-t bg-[#8a94a6]" style={{ height: `${Math.round((out / peak) * 140)}px` }} title={`${m.month}: ${rs(out)} out`} />
                    </div>
                    <span className="text-[10px] text-[#5b6b7b]">{m.month.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">Money in and out, month by month</caption>
            <thead className="text-xs uppercase tracking-wider text-[#4f5f70]">
              <tr><th className="py-1 text-start">Month</th><th className="py-1 text-end">Billed</th><th className="py-1 text-end">Collected</th><th className="py-1 text-end">Salaries</th><th className="py-1 text-end">Suppliers</th><th className="py-1 text-end">Left over</th></tr>
            </thead>
            <tbody className="divide-y divide-[#e3e7e7]">
              {d.months.map((m) => (
                <tr key={m.month}>
                  <td className="py-1.5 font-semibold text-[#1b2837]">{m.month}</td>
                  <td className="py-1.5 text-end text-[#5b6b7b]">{rs(m.billed)}</td>
                  <td className="py-1.5 text-end font-semibold text-[#1f5e53]">{rs(m.collected)}</td>
                  <td className="py-1.5 text-end text-[#5b6b7b]">{rs(m.payroll)}</td>
                  <td className="py-1.5 text-end text-[#5b6b7b]">{rs(m.supplies)}</td>
                  <td className={`py-1.5 text-end font-semibold ${m.net < 0 ? 'text-[#9f1239]' : 'text-[#1b2837]'}`}>{rs(m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="font-bold text-[#1b2837]">How families paid</h4>
          {Object.keys(d.collectedBy).length === 0 ? (
            <p className="mt-2 text-sm text-[#5b6b7b]">Nothing was collected in this period.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {Object.entries(d.collectedBy).sort((a, b) => b[1] - a[1]).map(([method, amount]) => (
                <li key={method} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-[#1b2837]">{method}</span>
                  <span className="font-semibold">{rs(amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h4 className="font-bold text-[#1b2837]">Largest supplier bills</h4>
          {!d.biggestBills.length ? (
            <p className="mt-2 text-sm text-[#5b6b7b]">No approved supplier bills in this period.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {d.biggestBills.map((b, i) => (
                <li key={`${b.invoiceNo}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-mono text-xs text-[#5b6b7b]">{b.invoiceNo || '(no number)'}</span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${b.status === 'paid' ? 'bg-[#e1f1ec] text-[#1f5e53]' : 'bg-[#fff6e5] text-[#8a5a00]'}`}>{b.status}</span>
                    <span className="font-semibold">{rs(b.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {d.books && (
        <Card>
          <h4 className="font-bold text-[#1b2837]">From the school's own books</h4>
          <p className="text-xs text-[#5b6b7b]">This school keeps a ledger, so these come from it rather than from the fee and purchase records above.</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[['Cash and bank', d.books.cash], ['Income this year', d.books.yearIncome], ['Spent this year', d.books.yearExpense], ['Fees receivable', d.books.feeReceivable], ['Owed to suppliers', d.books.suppliersOwed], ['Salaries owed', d.books.salariesOwed]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-[#f7f6f2] p-3">
                <dt className="text-[11px] text-[#5b6b7b]">{k}</dt>
                <dd className="font-bold text-[#1b2837]">{rs(v)}</dd>
              </div>
            ))}
          </dl>
          {d.books.closedThrough && <p className="mt-2 text-[11px] text-[#5b6b7b]">Books closed through {d.books.closedThrough}.</p>}
        </Card>
      )}
    </div>
  );
}

/* ── the whole group ── */
export default function GroupFinance() {
  const [period, setPeriod] = useState('year');
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    setD(null);
    apiClient.get('/director/finance', { params: { period } })
      .then((r) => setD(r.data))
      .catch((e) => toast.error(errMsg(e, 'Could not load the group’s money')));
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const picker = (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Which period to show">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          type="button"
          aria-pressed={period === p.key}
          onClick={() => setPeriod(p.key)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${period === p.key ? 'bg-[#1b2837] text-white' : 'bg-[#f1f1ee] text-[#4f5f70]'}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  if (open) {
    return (
      <div className="space-y-4">
        {picker}
        <SchoolFinance id={open} period={period} onBack={() => setOpen(null)} />
      </div>
    );
  }

  if (!d) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#2a5cac]" /></div>;

  const t = d.totals;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[#1b2837]">Money across the group</h2>
          <p className="text-sm text-[#5b6b7b]">{d.period.label} · {d.schools.length} school{d.schools.length === 1 ? '' : 's'}</p>
        </div>
        {picker}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Collected" value={rs(t.fees.collected)} sub={`of ${rs(t.fees.billed)} billed`} tone="text-[#1f5e53]" />
        <Stat label="Still owed" value={rs(t.fees.outstanding)} sub={t.fees.overdue ? `${rs(t.fees.overdue)} overdue` : 'nothing overdue'} tone={t.fees.overdue ? 'text-[#9f1239]' : undefined} />
        <Stat label="Salaries" value={rs(t.expenses.payroll)} sub="finalised pay runs" />
        <Stat label="Suppliers" value={rs(t.expenses.supplierBills)} sub={t.expenses.supplierOwed ? `${rs(t.expenses.supplierOwed)} not yet paid` : 'all paid'} />
        <Stat label="Left over" value={rs(t.net)} sub="collected minus spent" tone={t.net < 0 ? 'text-[#9f1239]' : 'text-[#1f5e53]'} />
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm text-[#5b6b7b]">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1f5e53]" />
        <span>
          These are totals and the schools' own expense lines. A child's fee record stays with their school — the group
          office sees how much is owed, not who owes it.
        </span>
      </p>

      <Card>
        <h3 className="text-lg font-black text-[#1b2837]">School by school</h3>
        <p className="text-xs text-[#5b6b7b]">Open one for its months, how families paid and its largest bills.</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[#e3e7e7]">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-[#f7f6f2] text-xs uppercase tracking-wider text-[#4f5f70]">
              <tr>
                <th className="px-3 py-2 text-start">School</th>
                <th className="px-3 py-2 text-end">Billed</th>
                <th className="px-3 py-2 text-end">Collected</th>
                <th className="px-3 py-2 text-start">Collection</th>
                <th className="px-3 py-2 text-end">Still owed</th>
                <th className="px-3 py-2 text-end">Spent</th>
                <th className="px-3 py-2 text-end">Left over</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e7e7] bg-white">
              {d.schools.map((s) => (
                <tr key={s.schoolId} className="cursor-pointer hover:bg-[#f7f6f2]" onClick={() => setOpen(s.schoolId)}>
                  <td className="px-3 py-2">
                    <button type="button" className="text-start font-semibold text-[#1b2837] underline-offset-2 hover:underline">{s.name}</button>
                    <span className="block font-mono text-[11px] text-[#5b6b7b]">{s.code}{s.isActive ? '' : ' · closed'}</span>
                  </td>
                  <td className="px-3 py-2 text-end text-[#5b6b7b]">{rs(s.fees.billed)}</td>
                  <td className="px-3 py-2 text-end font-semibold text-[#1f5e53]">{rs(s.fees.collected)}</td>
                  <td className="w-32 px-3 py-2"><Collected billed={s.fees.billed} collected={s.fees.collected} /></td>
                  <td className={`px-3 py-2 text-end ${s.fees.overdue ? 'font-semibold text-[#9f1239]' : 'text-[#5b6b7b]'}`}>{rs(s.fees.outstanding)}</td>
                  <td className="px-3 py-2 text-end text-[#5b6b7b]">{rs(s.expenses.total)}</td>
                  <td className="px-3 py-2 text-end font-semibold">
                    <span className={`inline-flex items-center gap-1 ${s.net < 0 ? 'text-[#9f1239]' : 'text-[#1f5e53]'}`}>
                      {s.net < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                      {rs(s.net)}
                    </span>
                  </td>
                </tr>
              ))}
              {!d.schools.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-[#5b6b7b]">No schools in this group yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {t.booksKept > 0 && <p className="mt-2 text-[11px] text-[#5b6b7b]">{t.booksKept} of {d.schools.length} schools keep a full ledger; together they hold {rs(t.cash)} in cash and bank.</p>}
      </Card>
    </div>
  );
}
