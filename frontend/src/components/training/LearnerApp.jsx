import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { Note, TBadge, Tabs, Table, Td, money, day, dt, saveBlob, PAY_METHODS } from './tkit';
import { useLGet } from './lkit';
import CoursePlayer from './CoursePlayer';

function Proof({ api, order, inst, onClose, onDone }) {
  const [f, setF] = useState({ reference: '', method: 'bank', note: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await api.post(`/orders/${order._id}/proof`, { no: inst.no, ...f }); toast.success('Thank you. Access opens when the school confirms the payment.'); await onDone(); } catch (x) { setErr(errMsg(x, 'Could not send that.')); setBusy(false); } };
  return (
    <Modal title={`Send proof of payment: ${order.orderNo}`} onClose={onClose}>
      <form onSubmit={go} className="grid gap-3">
        <p className="text-sm text-[#5b6b7b]">Instalment {inst.no}: {money(inst.amount, order.currency)}. Proof does not open the course by itself. The school opens it after checking the payment.</p>
        <Field label="Payment reference (transaction number, receipt number)"><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} required minLength={3} maxLength={80} autoFocus /></Field>
        <Field label="How you paid"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAY_METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Note for the office (optional)"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Sending…' : 'Send proof'}</button></div>
      </form>
    </Modal>
  );
}

function Orders({ api, me, reload }) {
  const [pf, setPf] = useState(null); const [pay, setPay] = useState(null);
  const cancel = async (o) => { try { await api.post(`/orders/${o._id}/cancel`); toast.success('Order cancelled'); await reload(); } catch (x) { toast.error(errMsg(x)); } };
  if (!me.orders.length) return <Card><EmptyState title="No orders yet" text="When you buy a course, your orders and payments show here." /></Card>;
  return (
    <div className="space-y-3">
      {me.paymentInstructions && <Card><h3 className="mb-1 text-sm font-semibold">How to pay</h3><p className="whitespace-pre-wrap text-sm">{me.paymentInstructions}</p></Card>}
      {me.orders.map((o) => (
        <Card key={o._id}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-mono text-xs">{o.orderNo}</span> <b className="text-sm">{o.title}</b></div><span className="flex items-center gap-2"><TBadge s={o.status} /><span className="text-sm">{money(o.total, o.currency)}</span></span></div>
          <ul className="mt-2 grid gap-1 text-sm">{o.installments.map((i) => (
            <li key={i.no} className="flex flex-wrap items-center justify-between gap-2"><span>Instalment {i.no}: {money(i.amount, o.currency)} · due {day(i.due)}</span><span className="flex items-center gap-2"><TBadge s={i.status} />{i.receiptNo && <span className="font-mono text-[11px]">{i.receiptNo}</span>}{['due', 'proof'].includes(i.status) && !['cancelled', 'refunded'].includes(o.status) && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Send proof for instalment ${i.no} of ${o.orderNo}`} onClick={() => setPf({ o, i })}>{i.status === 'proof' ? 'Send again' : 'I have paid'}</button>}</span>{i.rejected && <span className="w-full text-xs text-[#9f1239]">The school turned down your proof: {i.rejected}</span>}</li>
          ))}</ul>
          {o.refunded > 0 && <p className="mt-1 text-xs text-[#5b6b7b]">Refunded so far: {money(o.refunded, o.currency)}</p>}
          {o.status === 'pending' && !o.installments.some((i) => i.status === 'proof') && <div className="mt-2"><button className={`${btnDanger} !px-2 !py-1 !text-xs`} onClick={() => cancel(o)}>Cancel this order</button></div>}
        </Card>
      ))}
      {pf && <Proof api={api} order={pf.o} inst={pf.i} onClose={() => setPf(null)} onDone={async () => { setPf(null); await reload(); }} />}
    </div>
  );
}

function Catalog({ api, me, reload, go }) {
  const g = useLGet(api, '/catalog'); const [buy, setBuy] = useState(null); const d = g.data;
  if (g.loading && !d) return <p className="text-sm text-[#5b6b7b]" role="status">Loading…</p>; if (g.error) return <Note tone="warn">{g.error}</Note>;
  const have = new Set(me.courses.filter((c) => ['active', 'paused'].includes(c.state)).map((c) => String(c.courseId)));
  return (
    <div className="space-y-3">
      {d.courses.length === 0 && d.bundles.length === 0 ? <Card><EmptyState title="Nothing on sale right now" text="Check again later." /></Card> : (
        <ul className="grid gap-3 sm:grid-cols-2">{d.courses.map((c) => (
          <li key={c._id}><Card className="h-full"><h3 className="font-semibold text-[#1b2837]">{c.title}</h3><p className="mt-1 text-sm text-[#3b4a5c]">{c.summary}</p><p className="mt-2 text-sm font-semibold">{c.price ? money(c.price, d.currency) : 'Free'}</p>{c.cohorts?.length > 0 && <p className="text-xs text-[#5b6b7b]">Next start {day(c.cohorts[0].startsAt)}{c.cohorts[0].seatsLeft !== null ? ` · ${c.cohorts[0].seatsLeft} seats left` : ''}</p>}<div className="mt-3">{have.has(String(c._id)) ? <span className="text-xs font-semibold text-[#215a52]">You already have this course</span> : <button className={btnPrimary} onClick={() => setBuy(c)} aria-label={`Get ${c.title}`}>{c.price ? 'Order this course' : 'Join for free'}</button>}</div></Card></li>
        ))}</ul>
      )}
      {buy && <Checkout api={api} course={buy} onClose={() => setBuy(null)} onDone={async () => { setBuy(null); await reload(); go('orders'); }} />}
    </div>
  );
}

function Checkout({ api, course, onClose, onDone }) {
  const [f, setF] = useState({ cohortId: course.cohorts?.[0]?._id || '', installments: 1, coupon: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const r = await api.post('/checkout', { courseId: course._id, cohortId: f.cohortId || undefined, installments: Number(f.installments) || 1, coupon: f.coupon || undefined }); toast.success(r.data.order.total ? 'Order placed. Pay and send proof from "My orders".' : 'You are in'); await onDone(); } catch (x) { setErr(errMsg(x, 'Could not place the order.')); setBusy(false); } };
  return (
    <Modal title={course.title} onClose={onClose}>
      <form onSubmit={go} className="grid gap-3">
        {course.cohorts?.length > 0 && <Field label="Which run"><select className={inputCls} value={f.cohortId} onChange={(e) => setF({ ...f, cohortId: e.target.value })}>{course.cohorts.map((c) => <option key={c._id} value={c._id}>{c.name} · {day(c.startsAt)}{c.seatsLeft !== null ? ` · ${c.seatsLeft} seats left` : ''}</option>)}</select></Field>}
        {course.price > 0 && <><Field label="Instalments"><input className={inputCls} type="number" min="1" max={course.installments?.max || 1} value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} /></Field><Field label="Discount code (optional)"><input className={inputCls} value={f.coupon} onChange={(e) => setF({ ...f, coupon: e.target.value })} maxLength={24} /></Field></>}
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Working…' : course.price ? 'Place the order' : 'Join'}</button></div>
      </form>
    </Modal>
  );
}

function Certs({ api, me }) {
  const dl = async (c) => { try { const r = await api.blob(`/credentials/${c._id}/pdf`); saveBlob(r.data, `${c.serial}.pdf`); } catch (x) { toast.error('Could not download the certificate.'); } };
  const exp = async (c) => { try { const r = await api.get(`/credentials/${c._id}/export`); saveBlob(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }), `${c.serial}.json`); } catch (x) { toast.error(errMsg(x)); } };
  const share = async (c) => { const url = `${window.location.origin}/verify-credential/${c.verifyKey}`; try { await navigator.clipboard.writeText(url); toast.success('Link copied. Anyone can use it to check your certificate.'); } catch (e) { toast(url); } };
  if (!me.credentials.length) return <Card><EmptyState title="No certificates yet" text="When an instructor approves a finished course, your certificate appears here." /></Card>;
  return (
    <ul className="grid gap-3">{me.credentials.map((c) => (
      <li key={c._id}><Card><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm">{c.title}</b><div className="font-mono text-xs text-[#5b6b7b]">{c.serial} · {day(c.issuedAt)}</div></div><TBadge s={c.status === 'valid' ? 'valid' : 'revoked'} tone={c.status === 'valid' ? undefined : 'bad'} /></div>
        <div className="mt-2 flex flex-wrap gap-2"><button className={btnPrimary} aria-label={`Download certificate ${c.serial}`} onClick={() => dl(c)}>Download PDF</button><button className={btnGhost} onClick={() => share(c)} aria-label={`Copy the check link for ${c.serial}`}>Copy check link</button><button className={btnGhost} onClick={() => exp(c)} aria-label={`Download the evidence for ${c.serial}`}>Download the evidence</button></div></Card></li>
    ))}</ul>
  );
}

export default function LearnerApp({ api, onSignOut, compact }) {
  const g = useLGet(api, '/me'); const [tab, setTab] = useState('courses'); const [open, setOpen] = useState(null); const me = g.data;
  if (g.loading && !me) return <div className="p-6 text-sm text-[#5b6b7b]" role="status">Loading your courses…</div>;
  if (g.error) return <div className="mx-auto max-w-lg p-6"><Note tone="warn">{g.status === 401 ? 'This link is not valid. Ask the school for a new one.' : g.error}</Note></div>;
  if (open) return <CoursePlayer api={api} courseId={open.courseId} startLesson={open.lesson} onBack={() => { setOpen(null); g.reload(); }} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div>{!compact && <p className="text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">{me.school.name}</p>}<h2 className="text-xl font-bold text-[#1b2837]">{compact ? 'My courses' : `Hello, ${me.learner.name}`}</h2></div>{onSignOut && <button className={btnGhost} onClick={onSignOut}>Leave this page</button>}</div>
      <Tabs label="Learner sections" value={tab} onChange={setTab} items={[['courses', 'My courses'], ['find', 'Find a course'], ['orders', 'My orders', me.orders.filter((o) => o.installments.some((i) => i.status === 'due')).length || null], ['certs', 'Certificates', me.credentials.length || null]]} />
      {tab === 'courses' && (
        <div className="space-y-3">
          {me.upcoming.length > 0 && <Card><h3 className="mb-1 text-sm font-semibold">Coming up</h3><ul className="grid gap-1 text-sm">{me.upcoming.map((s) => <li key={`${s.id}`}><b>{dt(s.startsAt)}</b> · {s.courseTitle}: {s.title} · {s.mode === 'online' ? 'Online' : s.venue}{s.link && <> · <a className="text-[#2a5cac] underline" href={s.link} target="_blank" rel="noopener noreferrer">Join</a></>}</li>)}</ul></Card>}
          {me.courses.length === 0 ? <Card><EmptyState title="You are not in any course yet" text="Find a course to get started." action={<button className={btnPrimary} onClick={() => setTab('find')}>Find a course</button>} /></Card> : (
            <ul className="grid gap-3 sm:grid-cols-2">{me.courses.map((c) => (
              <li key={c.entitlementId}><Card className="h-full"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-[#1b2837]">{c.title}</h3><TBadge s={c.completion === 'complete' ? 'complete' : c.state} /></div>
                <div className="mt-2"><div role="progressbar" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.title} progress`} className="h-2 overflow-hidden rounded-full bg-[#e3e7e7]"><div className="h-full bg-[#2a5cac]" style={{ width: `${c.percent}%` }} /></div><p className="mt-1 text-xs text-[#5b6b7b]">{c.done} of {c.lessons} needed lessons · {c.percent}%</p></div>
                {c.cohort && <p className="mt-1 text-xs text-[#5b6b7b]">{c.cohort.name}</p>}{c.revokedReason && <p className="mt-1 text-xs text-[#9f1239]">{c.revokedReason}</p>}
                <div className="mt-3"><button className={btnPrimary} onClick={() => setOpen({ courseId: c.courseId, lesson: c.nextLessonId })} aria-label={`${c.percent ? 'Continue' : 'Start'} ${c.title}`}>{c.percent ? 'Continue' : 'Start'}</button></div></Card></li>
            ))}</ul>
          )}
        </div>
      )}
      {tab === 'find' && <Catalog api={api} me={me} reload={g.reload} go={setTab} />}
      {tab === 'orders' && <Orders api={api} me={me} reload={g.reload} />}
      {tab === 'certs' && <Certs api={api} me={me} />}
    </div>
  );
}
