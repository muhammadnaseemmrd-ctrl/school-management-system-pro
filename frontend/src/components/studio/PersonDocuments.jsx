// Everything the school can hand one person — an ID card, a report card, a leaving certificate —
// opened from that person's own record.
//
// The designs live in the documents studio, but nobody looking at a child thinks "I should go to
// a studio". They think "print her card". This is that button.

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FileText, Loader2, Printer, ShieldCheck } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Modal, btnGhost, btnPrimary, errMsg, fmtDate } from '../ui';

const openPdf = (id) => window.open(`/api/studio/issuances/${id}/pdf?token=${encodeURIComponent(localStorage.getItem('accessToken') || '')}`, '_blank', 'noopener');

export default function PersonDocuments({ kind = 'student', id, name, onClose }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    apiClient.get(`/studio/person/${kind}/${id}`)
      .then((r) => setD(r.data))
      .catch((e) => { toast.error(errMsg(e, 'Could not load the documents')); onClose(); });
  }, [kind, id, onClose]);
  useEffect(() => { load(); }, [load]);

  const issue = async (design) => {
    setBusy(design._id);
    try {
      const r = await apiClient.post('/studio/issue', { templateId: design._id, subjectIds: [id] });
      const made = (r.data.issued || [])[0];
      const skipped = (r.data.skipped || [])[0];
      if (made) { toast.success(`${design.familyLabel} made: ${made.serial}`); openPdf(made._id); }
      else toast.error(skipped?.reason || 'Nothing was made.');
      load();
    } catch (e) { toast.error(errMsg(e, 'Could not make it')); }
    setBusy('');
  };

  const ready = (d?.designs || []).filter((x) => x.ready);
  const draft = (d?.designs || []).filter((x) => !x.ready);

  return (
    <Modal title={`Documents for ${name || d?.person?.name || 'this person'}`} onClose={onClose} wide>
      {!d ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#2a5cac]" /></div>
      ) : (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-3 text-sm text-[#5b6b7b]">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1f5e53]" />
            <span>
              Each one gets a serial number and a page anyone can check it on, so a card or a certificate from this
              school can be told apart from a copy. The designs come from <b>Communication → Documents studio</b>.
            </span>
          </p>

          <div>
            <h4 className="text-sm font-black uppercase tracking-wide text-[#5b6b7b]">Make a new one</h4>
            {!ready.length ? (
              <p className="mt-2 rounded-xl border border-dashed border-[#e3e7e7] p-4 text-sm text-[#5b6b7b]">
                No approved design yet. Draw one in <b>Communication → Documents studio</b>, have a second administrator
                approve it, and it appears here.
                {!!(d.missing || []).length && <span className="mt-1 block text-xs">Nothing drawn yet for: {d.missing.join(', ')}.</span>}
              </p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {ready.map((x) => (
                  <button
                    key={x._id}
                    type="button"
                    disabled={!!busy}
                    onClick={() => issue(x)}
                    className="flex items-center gap-3 rounded-xl border border-[#e3e7e7] bg-white p-3 text-start transition hover:border-[#2a5cac] disabled:opacity-50"
                  >
                    {busy === x._id ? <Loader2 className="h-5 w-5 animate-spin text-[#2a5cac]" /> : <FileText className="h-5 w-5 text-[#2a5cac]" />}
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-[#1b2837]">{x.name}</span>
                      <span className="block text-xs text-[#5b6b7b]">{x.familyLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!!draft.length && (
              <p className="mt-2 text-xs text-[#5b6b7b]">
                Waiting for approval, so not yet available: {draft.map((x) => x.name).join(', ')}.
              </p>
            )}
          </div>

          <div className="border-t border-[#e3e7e7] pt-4">
            <h4 className="text-sm font-black uppercase tracking-wide text-[#5b6b7b]">Already issued</h4>
            {!d.issued.length ? (
              <p className="mt-2 text-sm text-[#5b6b7b]">Nothing has been issued to this person yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#e3e7e7] rounded-xl border border-[#e3e7e7] bg-white">
                {d.issued.map((x) => (
                  <li key={x._id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-semibold text-[#1b2837]">{x.familyLabel}</span>
                    <span className="font-mono text-xs text-[#5b6b7b]">{x.serial}</span>
                    <span className="text-xs text-[#5b6b7b]">{fmtDate(x.issuedAt)}</span>
                    {x.status !== 'Issued' && <span className="rounded-full bg-[#fff1f2] px-2 py-0.5 text-[11px] font-bold text-[#9f1239]">{x.status}</span>}
                    <button type="button" className={`${btnGhost} ms-auto !px-3 !py-1.5 !text-xs`} onClick={() => openPdf(x._id)}>
                      <Printer className="h-3.5 w-3.5" /> Print
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end"><button type="button" className={btnPrimary} onClick={onClose}>Done</button></div>
        </div>
      )}
    </Modal>
  );
}
