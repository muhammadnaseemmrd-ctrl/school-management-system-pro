import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Modal, EmptyState, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { Table, Td, Reason, Note, LBadge, AskForm, useGet, Loading, PageBar, useDebounced, parseCsv, money, saveBlob } from './libKit';

const KINDS = [['book', 'Book'], ['textbook', 'Textbook'], ['reference', 'Reference (stays in the library)'], ['periodical', 'Magazine or journal'], ['other', 'Other']];
const fields = (classes) => [
  { k: 'title', label: 'Title', required: true, full: true, max: 300 }, { k: 'authors', label: 'Authors', hint: 'Separate with a semicolon.', full: true },
  { k: 'isbn', label: 'ISBN', hint: 'Leave empty if there is none.' }, { k: 'kind', label: 'Kind', type: 'select', options: KINDS, def: 'book' },
  { k: 'publisher', label: 'Publisher' }, { k: 'year', label: 'Year', type: 'number', min: 1400, max: 2100 },
  { k: 'edition', label: 'Edition' }, { k: 'shelf', label: 'Shelf' }, { k: 'subjects', label: 'Subjects', hint: 'Separate with a semicolon.' }, { k: 'price', label: 'Replacement price (Rs)', type: 'number', min: 0, hint: 'Used for the lost and damaged charges.' },
  { k: 'classId', label: 'Textbook for class', type: 'select', options: [['', '— not a textbook —'], ...classes.map((c) => [c._id, c.name])], hint: 'Only for textbooks.' }, { k: 'subject', label: 'Textbook subject' },
];
const body = (v) => ({ title: v.title, authors: v.authors, isbn: v.isbn, kind: v.kind, publisher: v.publisher, year: v.year, edition: v.edition, shelf: v.shelf, subjects: v.subjects, price: v.price, classIds: v.classId ? [v.classId] : [], subject: v.subject });

function TitleDetail({ id, admin, classes, onClose, onChanged }) {
  const g = useGet(`/library/titles/${id}`); const [ask, setAsk] = useState(null);
  const labels = async () => { try { const r = await apiClient.post('/library/labels/copies', { titleId: id }, { responseType: 'blob' }); saveBlob(r.data, 'book-labels.pdf'); } catch (e) { toast.error('Could not make the labels.'); } };
  const t = g.data?.title;
  return (
    <Modal title={t ? t.title : 'Book'} onClose={onClose} wide>
      <Loading g={g}>{g.data && (
        <div className="space-y-3">
          <p className="text-sm text-[#3b4a5c]">{[(t.authors || []).join(', '), t.publisher, t.year, t.edition].filter(Boolean).join(' · ')}</p>
          <p className="text-xs text-[#5b6b7b]">{t.isbn ? `ISBN ${t.isbn} · ` : ''}{t.kind === 'textbook' ? 'Textbook' : t.kind === 'reference' ? 'Reference: stays in the library' : 'Can be lent'} · replacement price {money(t.price)} · shelf {t.shelf || '—'}</p>
          <div className="flex flex-wrap gap-2">
            {admin && <button className={btnPrimary} onClick={() => setAsk({ kind: 'copies' })}>Add copies</button>}
            {admin && <button className={btnGhost} onClick={() => setAsk({ kind: 'edit' })}>Edit details</button>}
            <button className={btnGhost} onClick={labels} disabled={!g.data.copies.length}>Print barcode labels</button>
          </div>
          {g.data.copies.length === 0 ? <EmptyState title="No copies yet" text="Add copies to give each one a barcode." /> : (
            <Table label="Copies" head={['Barcode', 'Status', 'Condition', 'Shelf', 'Out with', '']} min={600}>
              {g.data.copies.map((c) => <tr key={c._id}><Td className="font-mono text-xs">{c.barcode}</Td><Td><LBadge s={c.status} /></Td><Td className="capitalize">{c.condition}</Td><Td>{c.shelf || '—'}</Td><Td>{c.loan ? c.loan.holderName : '—'}</Td>
                <Td>{admin && !['on_loan', 'reserved'].includes(c.status) && <div className="flex flex-wrap gap-1">{c.status !== 'available' && c.status !== 'withdrawn' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={async () => { try { await apiClient.patch(`/library/copies/${c._id}`, { status: 'available', note: 'Back on the shelf' }); toast.success('Back on the shelf.'); g.reload(); onChanged(); } catch (e) { toast.error(errMsg(e)); } }}>Put on shelf</button>}
                  {c.status !== 'withdrawn' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk({ kind: 'withdraw', copy: c })}>Withdraw</button>}</div>}</Td></tr>)}
            </Table>
          )}
        </div>
      )}</Loading>
      {ask?.kind === 'copies' && <AskForm title="Add copies" confirm="Add" fields={[{ k: 'count', label: 'How many copies', type: 'number', min: 1, max: 200, def: 1, required: true }, { k: 'condition', label: 'Condition', type: 'select', options: [['new', 'New'], ['good', 'Good'], ['fair', 'Fair'], ['poor', 'Poor']], def: 'new' }, { k: 'shelf', label: 'Shelf', def: t?.shelf || '' }]} onClose={() => setAsk(null)} onDone={async (v) => { const r = await apiClient.post(`/library/titles/${id}/copies`, v); toast.success(`${r.data.added} copies added.`); setAsk(null); g.reload(); onChanged(); }} />}
      {ask?.kind === 'edit' && t && <AskForm title="Edit this book" wide fields={fields(classes)} initial={{ ...t, authors: (t.authors || []).join('; '), subjects: (t.subjects || []).join('; '), classId: t.textbook?.classIds?.[0] || '', subject: t.textbook?.subject || '', year: t.year || '' }} onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.patch(`/library/titles/${id}`, body(v)); toast.success('Saved.'); setAsk(null); g.reload(); onChanged(); }} />}
      {ask?.kind === 'withdraw' && <Reason title="Withdraw this copy" text="It will no longer be lent or counted." confirm="Withdraw" onClose={() => setAsk(null)} onDone={async (v) => { await apiClient.patch(`/library/copies/${ask.copy._id}`, { status: 'withdrawn', note: v }); setAsk(null); g.reload(); onChanged(); }} />}
    </Modal>
  );
}

const TEMPLATE = 'title,authors,isbn,publisher,year,edition,language,subjects,shelf,kind,price,copies\r\n"The Story of Pakistan","A. Rahman",9780306406157,"New Press",2019,2nd,English,"History;Pakistan",H-12,book,400,3\r\n';

function Import({ onClose, onDone }) {
  const [rows, setRows] = useState(null); const [prev, setPrev] = useState(null); const [dec, setDec] = useState({}); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const pick = async (f) => {
    setErr(''); setPrev(null); if (!f) return; if (f.size > 1.5 * 1024 * 1024) { setErr('That file is too large. Import up to 2000 rows at a time.'); return; }
    const parsed = parseCsv(await f.text()); if (!parsed.length) { setErr('The file has no rows. The first line must name the columns.'); return; } setRows(parsed);
    try { const r = await apiClient.post('/library/import/preview', { rows: parsed }); setPrev(r.data); const d = {}; r.data.rows.filter((x) => x.state === 'conflict').forEach((x) => { d[x.index] = 'keep'; }); setDec(d); } catch (e) { setErr(errMsg(e, 'Could not read that file.')); }
  };
  const commit = async () => { setBusy(true); try { const r = await apiClient.post('/library/import/commit', { rows, decisions: dec }); toast.success(`${r.data.added} added, ${r.data.updated} updated, ${r.data.copies} copies.`); onDone(); onClose(); } catch (e) { setErr(errMsg(e, 'Could not import.')); setBusy(false); } };
  const s = prev?.summary;
  return (
    <Modal title="Import books from a spreadsheet" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-sm text-[#5b6b7b]">Save your sheet as CSV. The first line names the columns: title, authors, isbn, publisher, year, edition, language, subjects, shelf, kind, price, copies. Nothing is added until you confirm below.</p>
        <div className="flex flex-wrap items-end gap-3"><Field label="CSV file"><input type="file" accept=".csv,text/csv" className={inputCls} onChange={(e) => pick(e.target.files?.[0])} /></Field><button className={btnGhost} onClick={() => saveBlob(new Blob([TEMPLATE], { type: 'text/csv' }), 'library-import-template.csv')}>Download a template</button></div>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        {s && <>
          <p className="text-sm"><b>{s.add}</b> new, <b>{s.conflict}</b> differ from the catalogue, <b>{s.same}</b> already there, <b>{s.duplicate}</b> repeated, <b>{s.problem}</b> with a problem. <b>{s.copies}</b> copies to add.</p>
          <Table label="Import preview" head={['Row', 'Book', 'ISBN', 'Copies', 'What happens']} min={640}>
            {prev.rows.slice(0, 200).map((r) => <tr key={r.index}><Td>{r.index + 2}</Td><Td>{r.row.title || '—'}</Td><Td className="font-mono text-xs">{r.isbn || '—'}</Td><Td>{r.copies}</Td>
              <Td><LBadge s={r.state} />{r.problems?.map((p) => <div key={p} className="text-xs text-[#9f1239]">{p}</div>)}{r.state === 'conflict' && <div className="mt-1"><label className="text-xs">Differs in {r.diffs.map((d) => d.field).join(', ')}: <select aria-label={`What to do with row ${r.index + 2}`} className="rounded border border-[#e3e7e7] px-1 py-0.5 text-xs" value={dec[r.index] || 'keep'} onChange={(e) => setDec({ ...dec, [r.index]: e.target.value })}><option value="keep">Keep the catalogue as it is</option><option value="overwrite">Use the spreadsheet</option></select></label></div>}</Td></tr>)}
          </Table>
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy || (s.add + s.conflict + s.same === 0)} onClick={commit}>{busy ? 'Importing…' : 'Import'}</button></div>
        </>}
      </div>
    </Modal>
  );
}

export default function Catalogue({ admin }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [kind, setKind] = useState(''); const [page, setPage] = useState(1); const [avail, setAvail] = useState(false);
  const g = useGet('/library/titles', { q: dq || undefined, kind: kind || undefined, page, limit: 20, available: avail ? '1' : undefined }); const classes = useGet('/classes', { limit: 100 }); const cl = classes.data?.classes || [];
  const [open, setOpen] = useState(null); const [ask, setAsk] = useState(null);
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1"><Field label="Search the catalogue"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Title, author, ISBN or subject" /></Field></div>
          <Field label="Kind"><select className={inputCls} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}><option value="">All kinds</option>{KINDS.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={avail} onChange={(e) => { setAvail(e.target.checked); setPage(1); }} /> Only on the shelf</label>
          {admin && <><button className={btnPrimary} onClick={() => setAsk('add')}>Add a book</button><button className={btnGhost} onClick={() => setAsk('import')}>Import a spreadsheet</button></>}
        </div>
      </Card>
      <Loading g={g}>{g.data && (g.data.rows.length === 0 ? <Card><EmptyState title="No books found" text={admin ? 'Add a book, or import your list from a spreadsheet.' : 'Try another word.'} /></Card> : (
        <>
          <Table label="Catalogue" head={['Book', 'Kind', 'Shelf', 'On the shelf', '']} min={600}>
            {g.data.rows.map((t) => <tr key={t._id}><Td><span className="font-medium">{t.title}</span><div className="text-xs text-[#5b6b7b]">{(t.authors || []).join(', ')}{t.isbn ? ` · ${t.isbn}` : ''}</div></Td><Td><LBadge s={t.kind} label={KINDS.find((k) => k[0] === t.kind)?.[1].split(' (')[0]} tone="none" /></Td><Td>{t.shelf || '—'}</Td><Td>{t.available} of {t.copies}</Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(t._id)} aria-label={`Open ${t.title}`}>Open</button></Td></tr>)}
          </Table>
          <PageBar page={g.data.page} total={g.data.total} limit={g.data.limit} onPage={setPage} />
        </>
      ))}</Loading>
      {open && <TitleDetail id={open} admin={admin} classes={cl} onClose={() => setOpen(null)} onChanged={g.reload} />}
      {ask === 'add' && <AskForm title="Add a book" wide fields={fields(cl)} confirm="Add the book" onClose={() => setAsk(null)} onDone={async (v) => { const r = await apiClient.post('/library/titles', body(v)); toast.success('Book added. Now add its copies.'); setAsk(null); g.reload(); setOpen(r.data._id); }} />}
      {ask === 'import' && <Import onClose={() => setAsk(null)} onDone={g.reload} />}
    </div>
  );
}
