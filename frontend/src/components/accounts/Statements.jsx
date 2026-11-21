import React, { useState } from 'react';
import { Card, Field, btnGhost, inputCls } from '../ui';
import { useGet, Loading, Note, Table, Td, Tabs, ABadge, Num, download, today, ym, ymName, day, useChart, money, Stat } from './acKit';

const first = () => `${ym()}-01`;
const SECTIONS = [['trial-balance', 'Trial balance'], ['income-expenditure', 'Income and expenditure'], ['balance-sheet', 'Balance sheet'], ['receipts-payments', 'Receipts and payments'], ['budget', 'Budget against actual'], ['ledger', 'Account ledger']];

const Lines = ({ title, rows, total, totalLabel }) => (
  <>
    <tr><Td className="font-bold text-[#1b2837]">{title}</Td><Td /></tr>
    {rows.map((r) => <tr key={r.code || r.name}><Td className="ps-5">{r.code ? `${r.code} · ` : ''}{r.name}</Td><Td className="text-end"><Num v={r.amount} neg /></Td></tr>)}
    <tr><Td className="font-semibold">{totalLabel}</Td><Td className="text-end"><Num v={total} bold neg /></Td></tr>
  </>
);

function Export({ path, params, name }) { return <button className={btnGhost} onClick={() => download(`/accounts/${path}?${new URLSearchParams({ ...params, format: 'csv' }).toString()}`, name)}>Download as a spreadsheet file</button>; }

export default function Statements({ seed }) {
  const [sec, setSec] = useState(seed?.section || 'trial-balance'); const [asOf, setAsOf] = useState(today()); const [from, setFrom] = useState(first()); const [to, setTo] = useState(today()); const [code, setCode] = useState(seed?.code || ''); const chart = useChart();
  const [fund, setFund] = useState(''); const funds = useGet('/accounts/funds');
  const ranged = sec === 'income-expenditure' || sec === 'receipts-payments' || sec === 'ledger'; const dated = sec === 'trial-balance' || sec === 'balance-sheet';
  const path = sec === 'ledger' ? '/accounts/ledger' : `/accounts/statements/${sec}`;
  const params = { ...(dated ? { asOf } : {}), ...(ranged ? { from, to } : {}), ...(sec === 'ledger' ? { code } : {}), ...(sec === 'income-expenditure' && fund ? { fundId: fund } : {}) };
  const need = sec === 'ledger' && !code;
  return (
    <div className="space-y-3">
      <Tabs label="Statements" value={sec} onChange={setSec} items={SECTIONS} />
      <Card><div className="flex flex-wrap items-end gap-3">
        {dated && <Field label="As at"><input type="date" className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>}
        {ranged && <><Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
        {sec === 'ledger' && <Field label="Account"><select className={inputCls} value={code} onChange={(e) => setCode(e.target.value)}><option value="">Choose an account</option>{chart.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field>}
        {sec === 'income-expenditure' && <Field label="Fund"><select className={inputCls} value={fund} onChange={(e) => setFund(e.target.value)}><option value="">The whole school</option>{(funds.data?.funds || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
        {!need && <Export path={sec === 'ledger' ? 'ledger' : `statements/${sec}`} params={params} name={`${sec}.csv`} />}</div></Card>
      {need ? <Card><p className="text-sm text-[#5b6b7b]">Choose an account to see every entry in it.</p></Card> : <Body key={`${sec}|${JSON.stringify(params)}`} sec={sec} path={path} params={params} />}
    </div>
  );
}

function Body({ sec, path, params }) {
  const g = useGet(path, params); const d = g.data;
  return (
    <Loading g={g}>{d && (
        <>
          {sec === 'trial-balance' && <>
            <Note tone={d.balanced ? 'good' : 'warn'}>{d.balanced ? 'Debits equal credits.' : 'Debits do not equal credits. Run the check under “Chart and rules”.'}</Note>
            <Table label="Trial balance" head={['Account', 'Debit', 'Credit']} min={480}>{d.rows.map((r) => <tr key={r.code}><Td>{r.code} · {r.name}</Td><Td className="text-end"><Num v={r.debitBalance} /></Td><Td className="text-end"><Num v={r.creditBalance} /></Td></tr>)}<tr><Td className="font-bold">Total</Td><Td className="text-end"><Num v={d.totalDebit} bold /></Td><Td className="text-end"><Num v={d.totalCredit} bold /></Td></tr></Table></>}
          {sec === 'income-expenditure' && <Table label="Income and expenditure" head={[`${day(d.from)} to ${day(d.to)}`, 'Rupees']} min={420}><Lines title="Income" rows={d.income} total={d.totalIncome} totalLabel="Total income" /><Lines title="Expenditure" rows={d.expense} total={d.totalExpense} totalLabel="Total expenditure" /><tr><Td className="font-bold">{d.surplus >= 0 ? 'Surplus' : 'Deficit'}</Td><Td className="text-end"><Num v={d.surplus} bold neg /></Td></tr></Table>}
          {sec === 'balance-sheet' && <>
            <Note tone={d.balanced ? 'good' : 'warn'}>{d.balanced ? 'Assets equal liabilities plus net assets.' : 'The balance sheet does not balance.'}</Note>
            <Table label="Balance sheet" head={[`As at ${day(d.asOf)}`, 'Rupees']} min={420}><Lines title="Assets" rows={d.assets} total={d.totalAssets} totalLabel="Total assets" /><Lines title="Liabilities" rows={d.liabilities} total={d.totalLiabilities} totalLabel="Total liabilities" />
              <Lines title="Net assets" rows={[...d.netAssetsAccounts, { name: 'Surplus kept so far', amount: d.accumulatedSurplus }]} total={d.totalNetAssets} totalLabel="Total net assets" />
              <tr><Td className="text-xs text-[#5b6b7b]">Of the net assets, tied to restricted funds and grants</Td><Td className="text-end"><Num v={d.restricted} /></Td></tr><tr><Td className="text-xs text-[#5b6b7b]">Free to use</Td><Td className="text-end"><Num v={d.unrestricted} /></Td></tr></Table></>}
          {sec === 'receipts-payments' && <Table label="Receipts and payments" head={[`${day(d.from)} to ${day(d.to)}`, 'Rupees']} min={420}><tr><Td className="font-semibold">Cash and bank at the start</Td><Td className="text-end"><Num v={d.opening} bold /></Td></tr><Lines title="Receipts" rows={d.receipts} total={d.totalReceipts} totalLabel="Total receipts" /><Lines title="Payments" rows={d.payments} total={d.totalPayments} totalLabel="Total payments" /><tr><Td className="font-bold">Cash and bank at the end</Td><Td className="text-end"><Num v={d.closing} bold neg /></Td></tr></Table>}
          {sec === 'budget' && <>
            <div className="grid grid-cols-2 gap-3"><Stat label="Income: budget to date" value={money(d.income.budget)} sub={`Actual ${money(d.income.actual)}`} /><Stat label="Expenses: budget to date" value={money(d.expense.budget)} sub={`Actual ${money(d.expense.actual)}`} /></div>
            {d.status === 'none' ? <Note tone="info">There is no budget for {d.fy} yet, so only what was actually posted is shown.</Note> : <p className="text-xs text-[#5b6b7b]">Budget version {d.version} ({d.status === 'approved' ? 'in force' : d.status}) up to {ymName(d.upTo)}.</p>}
            <Table label="Budget against actual" head={['Account', 'Year budget', 'Budget to date', 'Actual to date', 'Difference', '%']} min={680}>{d.rows.map((r) => <tr key={r.code}><Td>{r.code} · {r.name}</Td><Td className="text-end"><Num v={r.annual} /></Td><Td className="text-end"><Num v={r.budgetYtd} /></Td><Td className="text-end"><Num v={r.actualYtd} /></Td><Td className="text-end"><Num v={r.variance} neg /></Td><Td className="text-end">{r.percent == null ? '–' : `${r.percent}%`}</Td></tr>)}</Table>
            <p className="text-xs text-[#5b6b7b]">A negative difference is unfavourable: income below budget or spending above it.</p></>}
          {sec === 'ledger' && <>
            <p className="text-sm font-semibold text-[#1b2837]">{d.account.code} · {d.account.name}</p>
            <Table label="Account ledger" head={['Date', 'Journal', 'What', 'Debit', 'Credit', 'Balance']} min={680}><tr><Td /><Td /><Td className="font-semibold">Opening balance</Td><Td /><Td /><Td className="text-end"><Num v={d.opening} bold /></Td></tr>{d.rows.map((r, i) => <tr key={i}><Td className="text-xs">{day(r.date)}</Td><Td className="font-mono text-xs">{r.journalNo}</Td><Td>{r.memo}</Td><Td className="text-end"><Num v={r.debit} /></Td><Td className="text-end"><Num v={r.credit} /></Td><Td className="text-end"><Num v={r.balance} neg /></Td></tr>)}<tr><Td /><Td /><Td className="font-bold">Closing balance</Td><Td /><Td /><Td className="text-end"><Num v={d.closing} bold neg /></Td></tr></Table></>}
        </>)}</Loading>
  );
}
