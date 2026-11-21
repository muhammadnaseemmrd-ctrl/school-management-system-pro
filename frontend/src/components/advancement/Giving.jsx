import React, { useState } from 'react';
import { btnPrimary, btnGhost, btnDanger, Field, inputCls, Card } from '../ui';
import { useGet, Tabs, Loading, Note, Table, Td, Tag, AskForm, Reason, send, Empty, tone, lines, Tile, Grid, money, day, today, addDays } from './advKit';

const METHODS = [['cash', 'Cash'], ['bank', 'Bank transfer'], ['cheque', 'Cheque'], ['jazzcash', 'JazzCash'], ['easypaisa', 'Easypaisa'], ['card', 'Card'], ['other', 'Other']];
const REC = [['named', 'Thank by name'], ['anonymous', 'Anonymous']];
const FundPick = ({ funds }) => funds.map((f) => [f.id, `${f.name}${f.restricted ? ' (restricted)' : ''}`]);

function Funds({ ver, bump }) {
  const g = useGet('/advancement/giving/funds', { v: ver }); const [m, setM] = useState(null);
  const fields = (f) => [{ k: 'name', label: 'Fund name', required: true }, { k: 'purpose', label: 'What it is for', type: 'textarea' }, { k: 'restricted', label: 'Restriction', type: 'check', text: 'Restricted: donors gave it for particular uses' }, { k: 'allowed', label: 'Allowed uses (one per line, needed if restricted)', type: 'textarea' }, ...(f ? [{ k: 'reason', label: 'If you add allowed uses, write why and who agreed', type: 'textarea' }] : [])];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({})}>New fund</button></div>
      <Note>A fund is a separate pot. Gifts are never edited. A mistake is fixed with a reversal by someone else. A restricted fund can only be spent on its allowed uses.</Note>
      <Loading g={g}>{g.data && (g.data.funds.length === 0 ? <Empty>No funds yet.</Empty> : (
        <Table label="Funds" head={['Fund', 'Received', 'Spent', 'Reserved', 'Balance', 'Available', '']} min={820}>
          {g.data.funds.map((f) => <tr key={f.id}><Td><span className="font-semibold">{f.name}</span>{f.restricted && <Tag tone="warn">Restricted</Tag>}<span className="block text-xs text-[#5b6b7b]">{f.restricted ? `Only for: ${f.allowedCategories.join(', ')}` : f.purpose}</span>{f.restrictionNote && <span className="block text-xs text-[#5b6b7b]">{f.restrictionNote}</span>}</Td><Td><span dir="ltr">{money(f.received)}</span></Td><Td><span dir="ltr">{money(f.spent)}</span></Td><Td><span dir="ltr">{money(f.reserved)}</span></Td><Td><b dir="ltr">{money(f.balance)}</b></Td><Td><span dir="ltr">{money(f.available)}</span></Td><Td><button className={btnGhost} onClick={() => setM({ f })} aria-label={`Change ${f.name}`}>Change</button></Td></tr>)}
        </Table>))}</Loading>
      {m && <AskForm title={m.f ? `Change ${m.f.name}` : 'New fund'} fields={fields(m.f)} initial={m.f ? { name: m.f.name, purpose: m.f.purpose, restricted: m.f.restricted, allowed: (m.f.allowedCategories || []).join('\n') } : {}} onClose={() => setM(null)} onDone={async (v) => { const body = { name: v.name, purpose: v.purpose, restricted: !!v.restricted, allowedCategories: lines(v.allowed), reason: v.reason }; if (m.f) await send('put', `/giving/funds/${m.f.id}`, body, 'Saved'); else await send('post', '/giving/funds', body, 'Fund made'); setM(null); bump(); }} />}
    </div>
  );
}

function Pledges({ ver, bump }) {
  const g = useGet('/advancement/giving/pledges', { v: ver }); const f = useGet('/advancement/giving/funds', {}); const [m, setM] = useState(null);
  const funds = f.data?.funds || [];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({ t: 'new' })}>Record a pledge</button></div>
      <Loading g={g}>{g.data && (g.data.pledges.length === 0 ? <Empty>No pledges yet.</Empty> : (
        <Table label="Pledges" head={['No.', 'Donor', 'Promised', 'Paid', 'Still to come', 'Status', '']} min={820}>
          {g.data.pledges.map((p) => <tr key={p.id}><Td><span dir="ltr">{p.no}</span></Td><Td>{p.donorName}<span className="block text-xs text-[#5b6b7b]">{p.recognition === 'anonymous' ? 'Anonymous' : 'Thanked by name'}</span></Td><Td><span dir="ltr">{money(p.amount)}</span></Td><Td><span dir="ltr">{money(p.paid)}</span></Td><Td><span dir="ltr">{money(p.outstanding)}</span></Td><Td><Tag tone={tone(p.status)}>{p.status}</Tag></Td>
            <Td><div className="flex gap-2">{p.status === 'Open' && <button className={btnGhost} onClick={() => setM({ t: 'gift', p })} aria-label={`Record a gift for ${p.no}`}>Record a gift</button>}{p.status === 'Open' && <button className={btnGhost} onClick={() => setM({ t: 'close', p })} aria-label={`Close ${p.no}`}>Close</button>}</div></Td></tr>)}
        </Table>))}</Loading>
      {m?.t === 'new' && <AskForm title="Record a pledge" intro="A promise to give. Money counts only when a gift is recorded." fields={[{ k: 'donorName', label: 'Donor', required: true }, { k: 'fundId', label: 'Fund', type: 'select', required: true, options: [['', 'Choose…'], ...FundPick({ funds })] }, { k: 'amount', label: 'Amount', type: 'number', min: 1, required: true }, { k: 'recognition', label: 'Thanks', type: 'select', options: REC }, { k: 'dueOn', label: 'Pay by (optional, one payment)', type: 'date' }, { k: 'email', label: 'Contact email (only if they agreed)', type: 'email' }, { k: 'contactConsent', label: 'Contact', type: 'check', text: 'The donor agreed to be contacted' }]} onClose={() => setM(null)} onDone={async (v) => { await send('post', '/giving/pledges', { donorName: v.donorName, fundId: v.fundId, amount: Number(v.amount), recognition: v.recognition || 'named', contactConsent: !!v.contactConsent, contact: v.contactConsent ? { email: v.email } : undefined, schedule: v.dueOn ? [{ dueOn: v.dueOn, amount: Number(v.amount) }] : undefined }, 'Pledge recorded'); setM(null); bump(); }} />}
      {m?.t === 'gift' && <GiftForm pledge={m.p} funds={funds} onClose={() => setM(null)} done={() => { setM(null); bump(); }} />}
      {m?.t === 'close' && <AskForm title={`Close ${m.p.no}`} intro="Say why this pledge will not be paid in full. At least ten characters." fields={[{ k: 'status', label: 'Closed as', type: 'select', options: [['Cancelled', 'Cancelled by the donor or the school'], ['WrittenOff', 'Written off (not collectable)']] }, { k: 'reason', label: 'Why', type: 'textarea', required: true }]} initial={{ status: 'Cancelled' }} confirm="Close the pledge" onClose={() => setM(null)} onDone={async (v) => { await send('post', `/giving/pledges/${m.p.id}/status`, { status: v.status, reason: v.reason }, 'Closed'); setM(null); bump(); }} />}
    </div>
  );
}

function GiftForm({ pledge, funds, onClose, done }) {
  const key = React.useRef(`g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).current; const [dup, setDup] = useState(false);
  return <AskForm title={pledge ? `A gift towards ${pledge.no}` : 'Record a gift'} intro="Each gift gets a receipt number. A gift is never edited afterwards." initial={{ amount: pledge ? pledge.outstanding : '', receivedOn: today(), method: 'bank', recognition: 'anonymous' }}
    fields={[...(pledge ? [] : [{ k: 'fundId', label: 'Fund', type: 'select', required: true, options: [['', 'Choose…'], ...FundPick({ funds })] }, { k: 'donorName', label: 'Donor (leave empty for anonymous)' }, { k: 'recognition', label: 'Thanks', type: 'select', options: REC }]), { k: 'amount', label: 'Amount', type: 'number', min: 1, step: 'any', required: true }, { k: 'receivedOn', label: 'Received on', type: 'date', required: true, max: today() }, { k: 'method', label: 'How', type: 'select', options: METHODS }, { k: 'reference', label: 'Bank or receipt reference' }]}
    extra={dup ? <p className="text-sm text-[#9f1239] sm:col-span-2" role="alert">That reference was used before. Press the button again only if this really is another gift.</p> : null}
    onClose={onClose} onDone={async (v) => {
      try { const r = await send('post', '/giving/gifts', { pledgeId: pledge?.id, fundId: v.fundId || undefined, donorName: v.donorName, recognition: v.recognition, amount: Number(v.amount), receivedOn: v.receivedOn, method: v.method, reference: v.reference, idempotencyKey: key, allowDuplicateReference: dup }, null); done(); return r; }
      catch (e) { if (e.response?.data?.reason === 'duplicate_reference' && !dup) { setDup(true); throw new Error('Check the reference.'); } throw e; }
    }} confirm={dup ? 'Yes, it is another gift' : 'Record the gift'} />;
}

function Gifts({ ver, bump }) {
  const g = useGet('/advancement/giving/gifts', { v: ver }); const f = useGet('/advancement/giving/funds', {}); const [m, setM] = useState(null);
  const fname = (id) => f.data?.funds.find((x) => x.id === id)?.name || '';
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({ t: 'gift' })}>Record a gift</button></div>
      <Loading g={g}>{g.data && (g.data.gifts.length === 0 ? <Empty>No gifts yet.</Empty> : (
        <Table label="Gifts" head={['Receipt', 'Received', 'Donor', 'Fund', 'Amount', 'How', '']} min={860}>
          {g.data.gifts.map((x) => <tr key={x.id}><Td><span dir="ltr">{x.receiptNo}</span>{x.reversalOf && <Tag tone="warn">Reversal</Tag>}</Td><Td>{day(x.receivedOn)}</Td><Td>{x.donorName || 'Anonymous'}</Td><Td>{fname(x.fundId)}</Td><Td><b dir="ltr" className={x.amount < 0 ? 'text-[#9f1239]' : ''}>{money(x.amount)}</b></Td><Td className="text-xs">{x.method}{x.reference ? ` · ${x.reference}` : ''}</Td>
            <Td>{x.amount > 0 && !x.reversalReason && <div className="flex gap-2"><button className={btnGhost} onClick={async () => { await send('post', `/giving/gifts/${x.id}/acknowledge`, {}, 'Marked as thanked'); bump(); }} disabled={!!x.acknowledgedAt} aria-label={`Mark ${x.receiptNo} as thanked`}>{x.acknowledgedAt ? 'Thanked' : 'Mark thanked'}</button><button className={btnDanger} onClick={() => setM({ t: 'rev', x })} aria-label={`Reverse ${x.receiptNo}`}>Reverse</button></div>}</Td></tr>)}
        </Table>))}</Loading>
      {m?.t === 'gift' && <GiftForm funds={f.data?.funds || []} onClose={() => setM(null)} done={() => { setM(null); bump(); }} />}
      {m?.t === 'rev' && <Reason title={`Reverse ${m.x.receiptNo}`} text="A second row with the opposite amount is added. The original stays. Someone other than the person who recorded it must do this." confirm="Reverse the gift" onClose={() => setM(null)} onDone={async (n) => { await send('post', `/giving/gifts/${m.x.id}/reverse`, { reason: n }, 'Reversed'); setM(null); bump(); }} />}
    </div>
  );
}

function Spends({ ver, bump }) {
  const g = useGet('/advancement/giving/spends', { v: ver }); const f = useGet('/advancement/giving/funds', {}); const [m, setM] = useState(null); const funds = f.data?.funds || [];
  const fname = (id) => funds.find((x) => x.id === id)?.name || '';
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({ t: 'new' })}>Ask to spend</button></div>
      <Note>Spending from a fund is asked for by one person and approved by another. A restricted fund only allows its listed uses, unless the donor&apos;s agreement is written down.</Note>
      <Loading g={g}>{g.data && (g.data.spends.length === 0 ? <Empty>Nothing asked for yet.</Empty> : (
        <Table label="Spending" head={['Fund', 'Amount', 'For', 'Asked by', 'Status', '']} min={820}>
          {g.data.spends.map((s) => <tr key={s.id}><Td>{fname(s.fundId)}</Td><Td><b dir="ltr">{money(s.amount)}</b></Td><Td><span className="font-semibold">{s.category}</span><span className="block text-xs text-[#5b6b7b]">{s.description}</span>{s.variation?.note && <span className="block text-xs text-[#8a4636]">Outside the usual uses: {s.variation.note}</span>}</Td><Td>{s.requestedByName}</Td><Td><Tag tone={tone(s.status)}>{s.status}</Tag>{s.decidedByName && <span className="block text-xs text-[#5b6b7b]">{s.decidedByName}{s.soleAdmin ? ' (only administrator)' : ''}</span>}</Td>
            <Td>{s.status === 'Requested' && <div className="flex gap-2"><button className={btnPrimary} onClick={async () => { await send('post', `/giving/spends/${s.id}/decide`, { decision: 'approve' }, 'Approved'); bump(); }} aria-label={`Approve spending of ${money(s.amount)}`}>Approve</button><button className={btnGhost} onClick={() => setM({ t: 'no', s })} aria-label="Decline this spending">Decline</button></div>}</Td></tr>)}
        </Table>))}</Loading>
      {m?.t === 'new' && <AskForm title="Ask to spend from a fund" fields={[{ k: 'fundId', label: 'Fund', type: 'select', required: true, options: [['', 'Choose…'], ...FundPick({ funds })] }, { k: 'amount', label: 'Amount', type: 'number', min: 1, step: 'any', required: true }, { k: 'category', label: 'What kind of use', required: true }, { k: 'description', label: 'What exactly', type: 'textarea', required: true }, { k: 'variationNote', label: 'If this is outside the donor\'s allowed uses: where their agreement is written down', type: 'textarea' }]} onClose={() => setM(null)} onDone={async (v) => { await send('post', '/giving/spends', { fundId: v.fundId, amount: Number(v.amount), category: v.category, description: v.description, variationNote: v.variationNote || undefined }, 'Asked. Another administrator must approve it.'); setM(null); bump(); }} />}
      {m?.t === 'no' && <Reason title="Decline this spending" text="Say why." confirm="Decline" onClose={() => setM(null)} onDone={async (n) => { await send('post', `/giving/spends/${m.s.id}/decide`, { decision: 'decline', note: n }, 'Declined'); setM(null); bump(); }} />}
    </div>
  );
}

function Campaigns({ ver, bump, wide }) {
  const g = useGet('/advancement/giving/campaigns', { v: ver }); const f = useGet('/advancement/giving/funds', {}); const [m, setM] = useState(null); const funds = f.data?.funds || [];
  const fields = [{ k: 'title', label: 'Title', required: true }, { k: 'fundId', label: 'Fund the gifts go to', type: 'select', required: true, options: [['', 'Choose…'], ...FundPick({ funds })] }, { k: 'goal', label: 'Goal', type: 'number', min: 1, required: true }, { k: 'endsOn', label: 'Ends on', type: 'date' }, { k: 'story', label: 'The story for the public page', type: 'textarea' }, { k: 'uses', label: 'Where the money goes, one per line as "what, percent" (must add to 100)', type: 'textarea', required: true, ph: 'scholarships, 70' }];
  const body = (v) => ({ title: v.title, fundId: v.fundId, goal: Number(v.goal), endsOn: v.endsOn || undefined, story: v.story, uses: lines(v.uses).map((l) => { const [label, percent] = l.split(',').map((x) => x.trim()); return { label, percent: Number(percent) }; }) });
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setM({ t: 'new' })}>New campaign</button></div>
      <Note>A campaign page is read by a different administrator before it goes live. The public page shows the goal, the total and where the money goes. It never lists anonymous donors or shows contact details.</Note>
      <Loading g={g}>{g.data && (g.data.campaigns.length === 0 ? <Empty>No campaigns yet.</Empty> : (
        <Table label="Campaigns" head={['Campaign', 'Goal', 'Raised', 'Status', '']} min={820}>
          {g.data.campaigns.map((c) => <tr key={c.id}><Td><span className="font-semibold">{c.title}</span>{c.status === 'Live' || c.status === 'Closed' ? <span className="block text-xs text-[#5b6b7b]" dir="ltr">{window.location.origin}/campaigns/{c.code}</span> : null}</Td><Td><span dir="ltr">{money(c.goal)}</span></Td><Td><span dir="ltr">{money(c.raised)}</span> <span className="text-xs text-[#5b6b7b]">({c.donors} donors)</span></Td><Td><Tag tone={tone(c.status)}>{c.status === 'Review' ? 'Waiting to be read' : c.status}</Tag></Td>
            <Td><div className="flex flex-wrap gap-2">{c.status === 'Draft' && <><button className={btnGhost} onClick={() => setM({ t: 'edit', c })} aria-label={`Edit ${c.title}`}>Edit</button><button className={btnPrimary} onClick={async () => { await send('post', `/giving/campaigns/${c.id}/ask`, {}, 'Sent to be read'); bump(); }} aria-label={`Send ${c.title} to be read`}>Send to be read</button></>}{c.status === 'Review' && wide && <><button className={btnPrimary} onClick={async () => { await send('post', `/giving/campaigns/${c.id}/decide`, { decision: 'approve' }, 'Live'); bump(); }} aria-label={`Put ${c.title} live`}>Put live</button><button className={btnGhost} onClick={() => setM({ t: 'back', c })} aria-label={`Send ${c.title} back`}>Send back</button></>}{c.status === 'Live' && <button className={btnGhost} onClick={async () => { await send('post', `/giving/campaigns/${c.id}/close`, {}, 'Closed'); bump(); }} aria-label={`Close ${c.title}`}>Close</button>}</div></Td></tr>)}
        </Table>))}</Loading>
      {m && (m.t === 'new' || m.t === 'edit') && <AskForm title={m.t === 'new' ? 'New campaign' : 'Change the campaign'} fields={fields} initial={m.c ? { ...m.c, uses: (m.c.uses || []).map((u) => `${u.label}, ${u.percent}`).join('\n') } : {}} wide onClose={() => setM(null)} onDone={async (v) => { if (m.t === 'new') await send('post', '/giving/campaigns', body(v), 'Saved as a draft'); else await send('put', `/giving/campaigns/${m.c.id}`, body(v), 'Saved'); setM(null); bump(); }} />}
      {m?.t === 'back' && <Reason title="Send back" text="Say what needs to change." confirm="Send back" onClose={() => setM(null)} onDone={async (n) => { await send('post', `/giving/campaigns/${m.c.id}/decide`, { decision: 'reject', note: n }, 'Sent back'); setM(null); bump(); }} />}
    </div>
  );
}

export default function Giving({ wide }) {
  const [tab, setTab] = useState('funds'); const [ver, setVer] = useState(0); const bump = () => setVer((x) => x + 1); const ov = useGet('/advancement/giving/overview', { v: ver });
  return (
    <div className="space-y-4">
      <Loading g={ov}>{ov.data && <Grid><Tile label="Received so far" value={money(ov.data.received)} /><Tile label="In the funds now" value={money(ov.data.balance)} /><Tile label="Open pledges" value={ov.data.openPledges} /><Tile label="Spending waiting" value={ov.data.openSpends} tone={ov.data.openSpends ? 'text-[#8a4636]' : ''} /></Grid>}</Loading>
      <Tabs label="Giving sections" value={tab} onChange={setTab} items={[['funds', 'Funds'], ['pledges', 'Pledges'], ['gifts', 'Gifts'], ['spends', 'Spending', ov.data?.openSpends || null], ['campaigns', 'Campaigns', ov.data?.awaitingReview || null]]} />
      <div key={tab}>{tab === 'funds' && <Funds ver={ver} bump={bump} />}{tab === 'pledges' && <Pledges ver={ver} bump={bump} />}{tab === 'gifts' && <Gifts ver={ver} bump={bump} />}{tab === 'spends' && <Spends ver={ver} bump={bump} />}{tab === 'campaigns' && <Campaigns ver={ver} bump={bump} wide={wide} />}</div>
    </div>
  );
}
