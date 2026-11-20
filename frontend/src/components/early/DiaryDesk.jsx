import React, { useRef, useState } from 'react';
import { Card, Modal, Pill, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import apiClient from '../../utils/apiClient';
import { toast } from 'react-hot-toast';
import { call, useGet, Loading, Note, AuthImg, POST_TONE, POST_WORD, TYPE_LABEL, entryText, shrinkImage, Tabs } from './earlyKit';

function PhotoUpload({ roomId, roster, maxKb, onDone, onClose }) {
  const [file, setFile] = useState(null); const [alt, setAlt] = useState(''); const [ids, setIds] = useState([]); const [busy, setBusy] = useState(false); const ref = useRef(null);
  const send = async () => { setBusy(true); try { const image = await shrinkImage(file, maxKb); await apiClient.post('/early/media', { roomId, image, alt, childIds: ids }); toast.success('Photo saved. It reaches a family only when a diary that includes it is reviewed and published.'); onDone(); } catch (e) { toast.error(e.response ? errMsg(e) : e.message); } setBusy(false); };
  return (
    <Modal title="Add a photo" onClose={onClose}>
      <div className="grid gap-3"><Note>Tag every child who can be seen. A photo is shown to a family only if that child's family agreed to photos.</Note>
        <input ref={ref} type="file" accept="image/*" capture="environment" aria-label="Photo" onChange={(e) => setFile(e.target.files[0] || null)} />
        <Field label="Describe the photo in a few words" hint="So everyone can follow it, including people who cannot see it."><input className={inputCls} value={alt} onChange={(e) => setAlt(e.target.value)} /></Field>
        <fieldset><legend className="mb-1 text-xs font-semibold">Who is in the photo? (up to 6)</legend><div className="flex flex-wrap gap-2">{roster.map((c) => <label key={c._id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={ids.includes(c._id)} onChange={() => setIds(ids.includes(c._id) ? ids.filter((x) => x !== c._id) : [...ids, c._id].slice(0, 6))} />{c.name}</label>)}</div></fieldset>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || !file || alt.trim().length < 3 || !ids.length} onClick={send}>Save photo</button></div></div>
    </Modal>
  );
}

function Editor({ post, onClose, onDone, canReview, me }) {
  const g = useGet(`/early/posts/${post._id}`); const day = post.day; const care = useGet('/early/care', { roomId: post.roomId, childId: post.childId, day }); const media = useGet('/early/media', { roomId: post.roomId, childId: post.childId });
  const [f, setF] = useState(null); const [note, setNote] = useState(''); const [drop, setDrop] = useState(false); const [issues, setIssues] = useState([]);
  const d = g.data; const p = f || (d && { body: d.post.body, teacherComment: d.post.teacherComment, lang: d.post.lang, careIds: d.post.careIds, mediaIds: d.post.mediaIds });
  const editable = d && ['Draft', 'Withheld'].includes(d.post.state); const set = (k, v) => setF({ ...p, [k]: v }); const tog = (k, id) => set(k, p[k].includes(id) ? p[k].filter((x) => x !== id) : [...p[k], id]);
  const save = () => call(() => apiClient.put(`/early/posts/${post._id}`, p), 'Saved', () => { setF(null); g.reload(); });
  const submit = async () => { if (f) { try { await apiClient.put(`/early/posts/${post._id}`, p); } catch (e) { toast.error(errMsg(e)); return; } } await call(() => apiClient.post(`/early/posts/${post._id}/submit`), 'Sent for review', onDone); };
  const review = async (decision) => { setIssues([]); try { await apiClient.post(`/early/posts/${post._id}/review`, { decision, note, dropMedia: drop }); toast.success(decision === 'publish' ? 'Shared with the family' : 'Sent back'); onDone(); } catch (e) { if (e.response?.data?.issues) setIssues(e.response.data.issues); else toast.error(errMsg(e)); } };
  const retract = () => call(() => apiClient.post(`/early/posts/${post._id}/retract`, { reason: note }), 'Withdrawn', onDone);
  return (
    <Modal title={`${post.childName || 'Diary'} · ${post.day}`} onClose={onClose} wide>
      <Loading g={g}>{d && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2"><Pill value={POST_TONE[d.post.state]}>{POST_WORD[d.post.state]}</Pill><span className="text-xs text-[#5b6b7b]">Written by {d.post.authorName}{d.post.reviewedByName ? ` · checked by ${d.post.reviewedByName}${d.post.soleReviewer ? ' (the only reviewer available)' : ''}` : ''}</span></div>
          {d.post.reviewNote && <Note tone={d.post.state === 'Withheld' ? 'warn' : 'info'}>Reviewer: {d.post.reviewNote}</Note>}
          <Field label="Message to the family"><textarea className={inputCls} rows={5} dir="auto" disabled={!editable} value={p.body} onChange={(e) => set('body', e.target.value)} /></Field>
          <Field label="A comment from the teacher (optional)"><input className={inputCls} dir="auto" disabled={!editable} value={p.teacherComment} onChange={(e) => set('teacherComment', e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset><legend className="mb-1 text-xs font-semibold">Care entries shown to the family</legend><ul className="max-h-48 overflow-auto rounded-xl border border-[#e3e7e7] bg-white p-2 text-sm">{(care.data?.entries || []).map((e) => <li key={e._id}><label className="flex items-start gap-2"><input type="checkbox" disabled={!editable} checked={p.careIds.includes(e._id)} onChange={() => tog('careIds', e._id)} /> <span>{e.time} {TYPE_LABEL[e.careType]}: {entryText(e)}{e.careType === 'behavior' && !e.discussedAt ? ' (talk it over first)' : ''}</span></label></li>)}{!care.data?.entries?.length && <li className="text-[#5b6b7b]">No entries today.</li>}</ul></fieldset>
            <fieldset><legend className="mb-1 text-xs font-semibold">Photos</legend><div className="flex max-h-48 flex-wrap gap-2 overflow-auto">{(media.data?.media || []).map((m) => <label key={m._id} className="block w-24 text-center text-[11px]"><AuthImg src={`/early/media/${m._id}/image`} alt={m.alt} className="h-20 w-24 rounded-lg object-cover" /><input type="checkbox" disabled={!editable} checked={p.mediaIds.includes(m._id)} onChange={() => tog('mediaIds', m._id)} /> use</label>)}{!media.data?.media?.length && <span className="text-sm text-[#5b6b7b]">No photos of this child yet.</span>}</div></fieldset>
          </div>
          {issues.length > 0 && <Note tone="warn"><div className="font-semibold">This cannot be shared yet</div><ul className="list-disc ps-5">{issues.map((i) => <li key={i}>{i}</li>)}</ul>{issues.every((i) => /photos/.test(i)) && <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} /> Share it without the photos</label>}</Note>}
          {(d.post.state === 'Review' || d.post.state === 'Published') && <Field label={d.post.state === 'Review' ? 'Note to the writer (needed to send back)' : 'Why is it being withdrawn?'}><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
          <div className="flex flex-wrap justify-end gap-2">
            {editable && <><button className={btnGhost} disabled={!f} onClick={save}>Save draft</button><button className={btnPrimary} onClick={submit}>Send for review</button></>}
            {d.post.state === 'Review' && canReview && <><button className={btnGhost} disabled={note.trim().length < 3} onClick={() => review('withhold')}>Send back</button><button className={btnPrimary} onClick={() => review('publish')}>Share with the family</button></>}
            {d.post.state === 'Published' && canReview && <button className={btnDanger} disabled={note.trim().length < 3} onClick={retract}>Withdraw</button>}
          </div>
        </div>)}</Loading>
    </Modal>
  );
}

// The family diary: drafts from the day's log, a second person's check, then sharing.
export default function DiaryDesk({ roomId, me, isLead }) {
  const [tab, setTab] = useState('drafts'); const [open, setOpen] = useState(null); const [photo, setPhoto] = useState(false); const [lang, setLang] = useState('en');
  const state = tab === 'review' ? 'Review' : tab === 'shared' ? 'Published' : ''; const list = useGet('/early/posts', { roomId, ...(state ? { state } : {}), limit: 50 }); const room = useGet(`/early/rooms/${roomId}`); const settings = useGet('/early/settings');
  const rows = (list.data?.posts || []).filter((p) => (tab === 'drafts' ? ['Draft', 'Withheld'].includes(p.state) : true));
  const gen = () => call(() => apiClient.post('/early/posts/generate', { roomId, lang }), (r) => `${r.data.created} drafts made${r.data.skipped.length ? `, ${r.data.skipped.length} already had one` : ''}`, list.reload);
  const reload = () => { setOpen(null); list.reload(); };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><Tabs label="Diary" value={tab} onChange={setTab} items={[['drafts', 'Drafts'], ['review', 'Waiting for review'], ['shared', 'Shared']]} />
        <div className="flex flex-wrap items-center gap-2"><select className={`${inputCls} w-36`} aria-label="Language of drafts" value={lang} onChange={(e) => setLang(e.target.value)}><option value="en">English</option><option value="ur">اردو</option></select><button className={btnGhost} onClick={gen}>Make drafts from today's log</button><button className={btnGhost} onClick={() => setPhoto(true)}>Add a photo</button></div></div>
      <Note>A second person looks at every diary before a family sees it. Behaviour notes go in only after you have talked them over with the family.</Note>
      <Loading g={list}>{rows.length === 0 ? <Card><EmptyState title={tab === 'review' ? 'Nothing is waiting for review' : tab === 'shared' ? 'Nothing shared yet' : 'No drafts yet'} text={tab === 'drafts' ? 'Record meals, naps and notes in Today, then make drafts from the log.' : ''} /></Card> : (
        <Card className="!p-0 overflow-hidden"><ul>{rows.map((p) => (
          <li key={p._id} className="flex flex-wrap items-center gap-3 border-t border-[#e3e7e7] px-3 py-2 first:border-t-0"><div className="min-w-[10rem] flex-1"><div className="font-semibold">{p.childName}</div><div className="text-xs text-[#5b6b7b]">{p.day} · {p.kind === 'portfolio' ? 'Portfolio' : 'Diary'} · {p.authorName}</div></div>
            <Pill value={POST_TONE[p.state]}>{POST_WORD[p.state]}</Pill>{p.state === 'Published' && <span className="text-xs text-[#5b6b7b]">read by {p.readBy}</span>}<button className={btnGhost} onClick={() => setOpen(p)}>{p.state === 'Review' && isLead ? 'Check' : 'Open'}</button></li>))}</ul></Card>)}</Loading>
      {open && <Editor post={open} onClose={() => setOpen(null)} onDone={reload} canReview={isLead} me={me} />}
      {photo && room.data && <PhotoUpload roomId={roomId} roster={room.data.children} maxKb={settings.data?.settings?.photoMaxKb || 600} onClose={() => setPhoto(false)} onDone={() => setPhoto(false)} />}
    </div>
  );
}
