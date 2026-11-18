import React, { useCallback, useEffect, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { BarChart3, Building2, Wallet, Receipt, Share2, UserCog, Copy, Link2 } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { useLang } from '../../i18n/LanguageContext';
import {
  pkr, fmtDate, Card, Stat, Pill, Pager, TableSkeleton, EmptyState, Field, inputCls, btnPrimary, btnGhost, errMsg,
} from '../../components/ui';

const TABS = [['overview', 'Overview', BarChart3], ['schools', 'My schools', Building2], ['payments', 'Payments', Receipt], ['earnings', 'Commissions & payouts', Wallet], ['share', 'Share', Share2], ['profile', 'Profile', UserCog]];

// Small hook: load a paged list from the agent API with skeleton / empty / error states
const useList = (path, key, params = {}) => {
  const [state, setState] = useState({ rows: [], pagination: null, extra: null, loading: true, error: '' });
  const [page, setPage] = useState(1);
  const q = JSON.stringify(params);
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const r = await apiClient.get(path, { params: { page, ...JSON.parse(q) } });
      setState({ rows: r.data[key] || [], pagination: r.data.pagination, extra: r.data, loading: false, error: '' });
    } catch (e) { setState((s) => ({ ...s, loading: false, error: errMsg(e, 'Could not load') })); }
  }, [path, key, page, q]);
  useEffect(() => { load(); }, [load]);
  return { ...state, setPage, reload: load };
};

const Table = ({ head, children, state, empty, cols }) => (
  <Card className="overflow-hidden !p-0">
    {state.loading ? <TableSkeleton cols={cols || head.length} />
      : state.error ? <EmptyState title={state.error} action={<button onClick={state.reload} className={btnGhost}>Try again</button>} />
        : state.rows.length === 0 ? empty
          : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-start text-sm">
            <thead className="border-b border-[#e3e7e7] bg-[#f7f6f2] text-xs text-[#5b6b7b]"><tr>{head.map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody className="stagger">{children}</tbody></table></div>}
    <Pager pagination={state.pagination} onPage={state.setPage} />
  </Card>
);

const Overview = ({ go }) => {
  const { t } = useLang();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { apiClient.get('/agent/summary').then((r) => setD(r.data)).catch((e) => setErr(errMsg(e, 'Could not load'))); }, []);
  if (err) return <EmptyState title={err} />;
  if (!d) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28" />)}</div>;
  const s = d.schools; const c = d.commission;
  return (
    <div className="page-ready space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('Schools referred')} value={s.total} sub={`${s.Paying} ${t('paying')} · ${s.Free} ${t('on Free')}`} />
        <Stat label={t('Payments from your schools')} value={pkr(d.payments.totalPKR)} sub={`${d.payments.count} ${d.payments.count === 1 ? t('payment') : t('payments')}`} />
        <Stat label={t('Ready to be paid')} value={pkr(c.approvedPKR)} sub={t('Approved, not yet paid out')} tone="text-[#2a5cac]" />
        <Stat label={t('Waiting period')} value={pkr(c.pendingPKR)} sub={t('Becomes approved after the hold days')} tone="text-[#8a4636]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="font-semibold text-[#1b2837]">{t('Total earned')}: <span dir="ltr">{pkr(c.earnedPKR)}</span></h3>
          <p className="mt-1 text-sm text-[#5b6b7b]">{t('Paid out so far')}: <span dir="ltr">{pkr(c.paidPKR)}</span></p>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#eef2f8]" role="img" aria-label="Paid share of earnings">
            <div className="h-full bg-[#2c776c] transition-all duration-500" style={{ width: `${c.earnedPKR ? Math.min(100, (c.paidPKR / c.earnedPKR) * 100) : 0}%` }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => go('earnings')} className={btnGhost}>{t('See commissions')}</button><button onClick={() => go('share')} className={btnPrimary}>{t('Share my link')}</button></div>
        </Card>
        <Card>
          <h3 className="font-semibold text-[#1b2837]">{t('Renewals in the next 30 days')}</h3>
          {d.expiringSoon.length === 0 ? <p className="mt-3 text-sm text-[#5b6b7b]">{t('No renewals due soon.')}</p> : (
            <ul className="mt-3 space-y-2 text-sm">{d.expiringSoon.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2"><span className="truncate font-medium">{x.name}</span><span className="shrink-0 text-xs text-[#5b6b7b]">{fmtDate(x.subscriptionExpiresAt)}</span></li>))}</ul>)}
        </Card>
      </div>
    </div>
  );
};

const Schools = () => {
  const { t } = useLang();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const id = setTimeout(() => setQ(search), 300); return () => clearTimeout(id); }, [search]);
  const st = useList('/agent/schools', 'schools', { search: q });
  return (
    <div className="page-ready space-y-4">
      <input placeholder={t('Search name or code…')} value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} max-w-sm`} />
      <Table state={st} head={[t('School'), t('City'), t('Status'), t('Plan'), t('Joined'), t('Paid so far'), t('Your commission')]}
        empty={<EmptyState title={t('No schools yet')} text={t('Schools that sign up with your code or link appear here.')} />}>
        {st.rows.map((s) => (
          <tr key={s.id} className="border-b border-[#e3e7e7]/60 last:border-0">
            <td className="px-4 py-3"><p className="font-semibold text-[#1b2837]">{s.name}</p><p className="font-mono text-xs text-[#5b6b7b]">{s.code}</p></td>
            <td className="px-4 py-3">{s.city || '—'}</td>
            <td className="px-4 py-3"><Pill value={s.status}>{t(s.status)}</Pill></td>
            <td className="px-4 py-3 capitalize">{s.plan}</td>
            <td className="px-4 py-3">{fmtDate(s.joinedAt)}</td>
            <td className="px-4 py-3" dir="ltr">{pkr(s.totalPaidPKR)}</td>
            <td className="px-4 py-3" dir="ltr">{pkr(s.commissionPKR)} <span className="text-xs text-[#5b6b7b]">({s.commissionPercent}%)</span></td>
          </tr>))}
      </Table>
    </div>
  );
};

const Payments = () => {
  const { t } = useLang();
  const st = useList('/agent/payments', 'payments');
  return (
    <div className="page-ready"><Table state={st} head={[t('Date'), t('School'), t('Plan'), t('Amount'), t('Status'), t('Commission')]}
      empty={<EmptyState title={t('No payments yet')} text={t('When a referred school pays, the payment and your commission show up here.')} />}>
      {st.rows.map((p) => (
        <tr key={p.id} className="border-b border-[#e3e7e7]/60 last:border-0">
          <td className="px-4 py-3">{fmtDate(p.paidAt)}</td>
          <td className="px-4 py-3 font-semibold">{p.schoolName}</td>
          <td className="px-4 py-3 capitalize">{p.plan} · {p.billingPeriod}</td>
          <td className="px-4 py-3" dir="ltr">{pkr(p.amountPKR)}</td>
          <td className="px-4 py-3"><Pill value={p.status}>{t(p.status)}</Pill></td>
          <td className="px-4 py-3" dir="ltr">{pkr(p.commissionPKR)} {p.commissionStatus && <Pill value={p.commissionStatus}>{t(p.commissionStatus)}</Pill>}</td>
        </tr>))}
    </Table></div>
  );
};

const Earnings = () => {
  const { t } = useLang();
  const [status, setStatus] = useState('');
  const st = useList('/agent/commissions', 'commissions', status ? { status } : {});
  const po = useList('/agent/payouts', 'payouts');
  const b = st.extra?.balance;
  return (
    <div className="page-ready space-y-6">
      {b && <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t('Waiting period')} value={pkr(b.pendingPKR)} tone="text-[#8a4636]" />
        <Stat label={t('Ready to be paid')} value={pkr(b.approvedPKR)} tone="text-[#2a5cac]" />
        <Stat label={t('Paid out')} value={pkr(b.paidPKR)} tone="text-[#215a52]" />
      </div>}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{t('Commissions')}</span>
        <select value={status} onChange={(e) => { setStatus(e.target.value); st.setPage(1); }} className={`${inputCls} !w-auto`} aria-label={t('Status')}>
          <option value="">{t('All')}</option>{['Pending', 'Approved', 'Paid', 'Void'].map((x) => <option key={x} value={x}>{t(x)}</option>)}
        </select>
      </div>
      <Table state={st} head={[t('Date'), t('School'), t('Payment'), t('Rate'), t('Commission'), t('Status')]}
        empty={<EmptyState title={t('No commissions yet')} text={t('Commission is earned on each confirmed payment from your schools.')} />}>
        {st.rows.map((c) => (
          <tr key={c.id} className="border-b border-[#e3e7e7]/60 last:border-0">
            <td className="px-4 py-3">{fmtDate(c.createdAt)}</td>
            <td className="px-4 py-3 font-semibold">{c.schoolName}{c.kind === 'reversal' && <span className="ms-2 text-xs text-[#8a4636]">{t('refund adjustment')}</span>}</td>
            <td className="px-4 py-3" dir="ltr">{pkr(c.baseAmountPKR)}</td>
            <td className="px-4 py-3" dir="ltr">{c.percent}%</td>
            <td className="px-4 py-3 font-semibold" dir="ltr">{pkr(c.amountPKR)}</td>
            <td className="px-4 py-3"><Pill value={c.status}>{t(c.status)}</Pill>{c.status === 'Pending' && c.eligibleAt && <p className="mt-1 text-[11px] text-[#5b6b7b]">{t('Approves after')} {fmtDate(c.eligibleAt)}</p>}{c.voidReason && <p className="mt-1 text-[11px] text-[#5b6b7b]">{c.voidReason}</p>}</td>
          </tr>))}
      </Table>
      <h3 className="text-sm font-semibold">{t('Payouts received')}</h3>
      <Table state={po} head={[t('Date'), t('Amount'), t('Method'), t('Reference'), t('Items')]}
        empty={<EmptyState title={t('No payouts yet')} text={t('Approved commissions are paid together. Each payout appears here.')} />}>
        {po.rows.map((p) => (
          <tr key={p.id} className="border-b border-[#e3e7e7]/60 last:border-0">
            <td className="px-4 py-3">{fmtDate(p.paidAt)}</td><td className="px-4 py-3 font-semibold" dir="ltr">{pkr(p.amountPKR)}</td>
            <td className="px-4 py-3">{p.method}</td><td className="px-4 py-3 font-mono text-xs">{p.reference || '—'}</td><td className="px-4 py-3">{p.items}</td>
          </tr>))}
      </Table>
    </div>
  );
};

const Share = ({ me }) => {
  const { t } = useLang();
  const [policy, setPolicy] = useState(null);
  useEffect(() => { apiClient.get('/agent/policy').then((r) => setPolicy(r.data.policy)).catch(() => {}); }, []);
  const link = `${window.location.origin}/register?ref=${encodeURIComponent(me.referralCode)}`;
  const copy = (v) => { navigator.clipboard?.writeText(v); toast.success(t('Copied')); };
  return (
    <div className="page-ready grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <h3 className="font-semibold">{t('Your referral code')}</h3>
        <div className="flex items-center gap-2"><code className="rounded-lg bg-[#eef2f8] px-4 py-2 text-lg font-bold tracking-wider text-[#1b2837]" dir="ltr">{me.referralCode}</code>
          <button onClick={() => copy(me.referralCode)} className={btnGhost} aria-label="Copy code"><Copy className="h-4 w-4" /></button></div>
        <h3 className="font-semibold">{t('Your sign-up link')}</h3>
        <div className="flex items-center gap-2"><input readOnly value={link} className={`${inputCls} font-mono text-xs`} dir="ltr" onFocus={(e) => e.target.select()} />
          <button onClick={() => copy(link)} className={btnPrimary} aria-label="Copy link"><Link2 className="h-4 w-4" /></button></div>
        <p className="text-sm text-[#5b6b7b]">{t('A school that signs up with this link or code is tied to you. Your rate is fixed when they join.')}</p>
      </Card>
      <Card>
        <h3 className="font-semibold">{t('How commission works')}</h3>
        <ul className="mt-3 space-y-2 text-sm text-[#3b4a5c]">
          <li>• {t('Your rate')}: <b>{me.commissionPercent}%</b> {t('of each confirmed payment.')}</li>
          {policy && <li>• {t('You earn for')} <b>{policy.recurringMonths}</b> {t('months from the day a school joins.')}</li>}
          {policy && <li>• {t('Each commission waits')} <b>{policy.holdDays}</b> {t('days before it is approved.')}</li>}
          <li>• {t('If a payment is refunded, its commission is cancelled or adjusted.')}</li>
          <li>• {t('Free-plan schools do not generate commission.')}</li>
        </ul>
      </Card>
    </div>
  );
};

const Profile = ({ me, onSaved }) => {
  const { t } = useLang();
  const [f, setF] = useState({ name: me.name || '', phone: me.phone || '', city: me.city || '', payout: { method: me.payout?.method || '', accountTitle: me.payout?.accountTitle || '', accountNumber: me.payout?.accountNumber || '' } });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await apiClient.put('/agent/me', f); onSaved(r.data.agent); toast.success(t('Saved')); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const changePw = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await apiClient.put('/agent/password', pw); setPw({ currentPassword: '', newPassword: '' }); toast.success(t('Password changed')); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const P = (k) => (e) => setF({ ...f, payout: { ...f.payout, [k]: e.target.value } });
  return (
    <div className="page-ready grid gap-4 lg:grid-cols-2">
      <Card><form onSubmit={save} className="space-y-4">
        <h3 className="font-semibold">{t('Your details')}</h3>
        <Field label={t('Name')}><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('Email')} hint={t('Email can only be changed by the Aulensia team.')}><input disabled className={`${inputCls} bg-[#f7f6f2]`} value={me.email} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label={t('Phone')}><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label={t('City')}><input className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field></div>
        <h3 className="pt-2 font-semibold">{t('Where to send your payouts')}</h3>
        <Field label={t('Method')}><input className={inputCls} placeholder="Bank / JazzCash / Easypaisa" value={f.payout.method} onChange={P('method')} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label={t('Account title')}><input className={inputCls} value={f.payout.accountTitle} onChange={P('accountTitle')} /></Field>
          <Field label={t('Account number')}><input className={inputCls} dir="ltr" value={f.payout.accountNumber} onChange={P('accountNumber')} /></Field></div>
        <button disabled={busy} className={btnPrimary}>{busy ? t('Saving…') : t('Save')}</button>
      </form></Card>
      <Card><form onSubmit={changePw} className="space-y-4">
        <h3 className="font-semibold">{t('Change password')}</h3>
        <Field label={t('Current password')}><input type="password" required autoComplete="current-password" className={inputCls} value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
        <Field label={t('New password')} hint={t('At least 8 characters with upper and lower case, a number and a symbol.')}><input type="password" required autoComplete="new-password" className={inputCls} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
        <button disabled={busy} className={btnPrimary}>{t('Change password')}</button>
      </form></Card>
    </div>
  );
};

const AgentDashboard = () => {
  const { t } = useLang();
  const [tab, setTab] = useState(() => localStorage.getItem('agentActiveTab') || 'overview');
  const [me, setMe] = useState(null);
  useEffect(() => { localStorage.setItem('agentActiveTab', tab); }, [tab]);
  useEffect(() => { apiClient.get('/agent/me').then((r) => setMe(r.data.agent)).catch(() => {}); }, []);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Toaster position="top-right" />
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[#1b2837]">{t('Welcome')}{me ? `, ${me.name.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-[#5b6b7b]">{t('Your schools, payments and commission in one place. You only see what is yours.')}</p>
      </div>
      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto border-b border-[#e3e7e7]">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>
            <Icon className="h-4 w-4" />{t(label)}
          </button>))}
      </div>
      {tab === 'overview' && <Overview go={setTab} />}
      {tab === 'schools' && <Schools />}
      {tab === 'payments' && <Payments />}
      {tab === 'earnings' && <Earnings />}
      {tab === 'share' && (me ? <Share me={me} /> : <div className="skeleton h-48" />)}
      {tab === 'profile' && (me ? <Profile me={me} onSaved={setMe} /> : <div className="skeleton h-48" />)}
    </div>
  );
};

export default AgentDashboard;
