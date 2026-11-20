import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../utils/apiClient';

const pkr = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const input = 'w-full rounded-lg border border-[#a9b4bf] bg-white px-3 py-2.5 text-sm focus:border-[#2a5cac] focus:outline-none focus:ring-2 focus:ring-[#2a5cac]/30';

// The page a buyer opens from the private link in a quote (PRD E28). Printable, no sign-in.
export default function ProposalPage() {
  const { token } = useParams(); const [d, setD] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [agree, setAgree] = useState(false); const [msg, setMsg] = useState(''); const [declining, setDeclining] = useState(false); const [reason, setReason] = useState('');
  const load = () => apiClient.get(`/public/proposal/${token}`).then((r) => { setD(r.data); setErr(''); }).catch((e) => setErr(e.response?.data?.message || 'This link is not valid. Ask for a new one.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);
  const accept = async (e) => { e.preventDefault(); setBusy(true); setMsg(''); try { await apiClient.post(`/public/proposal/${token}/accept`, { name, email, agree }); await load(); } catch (x) { setMsg(x.response?.data?.message || 'Could not accept the quote.'); } finally { setBusy(false); } };
  const decline = async () => { setBusy(true); try { await apiClient.post(`/public/proposal/${token}/decline`, { reason }); await load(); setDeclining(false); } catch (x) { setMsg(x.response?.data?.message || 'Could not send that.'); } finally { setBusy(false); } };
  if (err) return <main className="grid min-h-screen place-items-center bg-[#f7f6f2] p-6 text-center"><div><h1 className="font-display text-2xl font-bold text-[#1b2837]">We could not open this quote</h1><p className="mt-2 text-[#3b4a5c]">{err}</p></div></main>;
  if (!d) return <main className="grid min-h-screen place-items-center bg-[#f7f6f2]" aria-busy="true"><p className="text-[#5b6b7b]">Loading…</p></main>;
  const { quote: q, seller, invoice, payment } = d; const open = q.status === 'Sent';
  const badge = { Sent: 'Waiting for your answer', Accepted: 'Accepted', Declined: 'Declined', Expired: 'Expired', Withdrawn: 'Withdrawn', Draft: 'Draft' }[q.status];
  return (
    <main className="min-h-screen bg-[#f7f6f2] px-4 py-8 text-[#1b2837] print:bg-white print:p-0">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#e3e7e7] bg-white p-6 shadow-sm sm:p-10 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e3e7e7] pb-6">
          <div><p className="font-display text-2xl font-bold text-[#2a5cac]">{seller.name}</p><p className="mt-1 text-sm text-[#5b6b7b]">{[seller.address, seller.email, seller.phone].filter(Boolean).join(' · ')}</p></div>
          <div className="text-end"><p className="text-xs font-bold uppercase tracking-widest text-[#8a4636]">Quote</p><p className="font-mono text-lg font-bold">{q.number}</p><p className="mt-1 text-sm text-[#5b6b7b]">{day(q.createdAt)}</p></div>
        </header>
        <section className="mt-6 grid gap-1 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-widest text-[#5b6b7b]">Prepared for</p><p className="font-semibold">{q.schoolName}</p><p className="text-sm text-[#3b4a5c]">{q.buyerName}</p></div>
          <div className="sm:text-end"><p className="text-xs font-bold uppercase tracking-widest text-[#5b6b7b]">Status</p><p className={`font-semibold ${q.status === 'Accepted' ? 'text-[#2c776c]' : q.status === 'Sent' ? 'text-[#2a5cac]' : 'text-[#8a3a28]'}`}>{badge}</p>{open && <p className="text-sm text-[#3b4a5c]">Valid until {day(q.validUntil)}</p>}</div></section>
        <table className="mt-6 w-full text-sm"><caption className="sr-only">Items in this quote</caption><thead><tr className="border-b border-[#a9b4bf] text-start"><th scope="col" className="py-2 text-start">Item</th><th scope="col" className="py-2 text-end">Amount</th></tr></thead>
          <tbody>{q.lines.map((l, i) => <tr key={i} className="border-b border-[#e3e7e7]"><td className="py-2">{l.label}</td><td className="py-2 text-end">{pkr(l.amountPKR)}</td></tr>)}
            {q.discountPKR > 0 && <tr className="border-b border-[#e3e7e7] text-[#2c776c]"><td className="py-2">Discount {q.discountPercent}%</td><td className="py-2 text-end">− {pkr(q.discountPKR)}</td></tr>}</tbody>
          <tfoot><tr><th scope="row" className="py-3 text-start text-base">Total</th><td className="py-3 text-end text-xl font-black">{pkr(q.totalPKR)}</td></tr></tfoot></table>
        {q.note && <p className="mt-4 rounded-lg bg-[#f7f6f2] p-3 text-sm text-[#3b4a5c]">{q.note}</p>}
        <details className="mt-6 text-sm text-[#3b4a5c]" open={open}><summary className="cursor-pointer font-semibold text-[#1b2837]">Terms</summary><p className="mt-2 whitespace-pre-line leading-6">{q.terms}</p></details>
        {open && (<form onSubmit={accept} className="mt-8 grid gap-4 rounded-xl border border-[#a9b4bf] bg-[#f7f6f2] p-5 print:hidden"><h2 className="font-display text-lg font-bold">Accept this quote</h2>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Your full name<input className={`mt-1 ${input}`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></label><label className="text-sm font-semibold">Your email<input type="email" className={`mt-1 ${input}`} value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={160} /></label></div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I have read the terms above and accept this quote for {q.schoolName}.</span></label>
          {msg && <p role="alert" className="text-sm text-[#8a3a28]">{msg}</p>}
          <div className="flex flex-wrap gap-3"><button disabled={busy} className="rounded-lg bg-[#2a5cac] px-6 py-3 font-bold text-white hover:bg-[#234c91] disabled:opacity-60">{busy ? 'Please wait…' : 'Accept and get the invoice'}</button><button type="button" onClick={() => setDeclining((v) => !v)} className="rounded-lg border border-[#a9b4bf] px-5 py-3 font-semibold text-[#2b3a4d]">No thanks</button></div>
          {declining && <div className="grid gap-2"><label className="text-sm font-semibold">Would you tell us why? (optional)<textarea rows={2} className={`mt-1 ${input}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label><button type="button" onClick={decline} disabled={busy} className="justify-self-start rounded-lg bg-[#8a3a28] px-5 py-2 text-sm font-bold text-white">Decline the quote</button></div>}</form>)}
        {invoice && (<section className="mt-8 rounded-xl border border-[#a9b4bf] p-5"><h2 className="font-display text-lg font-bold">Invoice {invoice.number}</h2>
          <p className="mt-1 text-sm text-[#3b4a5c]">{invoice.status === 'Paid' ? `Paid on ${day(invoice.paidAt)}. Thank you.` : `${pkr(invoice.totalPKR)} due by ${day(invoice.dueAt)}${invoice.overdue ? ' (overdue)' : ''}.`}</p>
          {payment && (<dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">{[['Bank', payment.bankName], ['Account title', payment.accountTitle], ['Account number', payment.accountNumber], ['IBAN', payment.iban], ['JazzCash', payment.jazzcash], ['Easypaisa', payment.easypaisa]].filter(([, v]) => v).map(([k, v]) => (<React.Fragment key={k}><dt className="font-semibold">{k}</dt><dd className="font-mono">{v}</dd></React.Fragment>))}</dl>)}
          {payment && !payment.bankName && !payment.jazzcash && !payment.easypaisa && <p className="mt-3 text-sm text-[#3b4a5c]">Our team will send you the payment details shortly.</p>}
          {payment && <p className="mt-3 text-sm text-[#3b4a5c]">{payment.note || `Please use ${invoice.number} as the payment reference, then tell us once you have paid.`}</p>}</section>)}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e3e7e7] pt-4 text-xs text-[#5b6b7b] print:hidden"><span>Questions? {seller.email || seller.phone || 'Reply to the message that brought you here.'}</span><button onClick={() => window.print()} className="rounded-lg border border-[#a9b4bf] px-3 py-1.5 font-semibold text-[#2b3a4d]">Print or save as PDF</button></footer>
      </article>
    </main>
  );
}
