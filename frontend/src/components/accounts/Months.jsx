import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, btnGhost, btnPrimary, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Reason, ABadge, Num, Trail, day, ymName } from './acKit';

export default function Months({ t }) {
  const g = useGet('/accounts/periods'); const [list, setList] = useState(null); const [ask, setAsk] = useState(null); const [chk, setChk] = useState(null);
  const act = async (fn, ok, mo) => { try { await fn(); toast.success(ok); g.reload(); } catch (e) { const d = e?.response?.data; toast.error(errMsg(e)); if (d?.checklist) setChk({ ym: mo, ...d.checklist }); } };
  const look = async (p) => { try { const r = await apiClient.get(`/accounts/periods/${p.ym}/checklist`); setChk({ ym: p.ym, ...r.data }); } catch (e) { toast.error(errMsg(e)); } };
  const verify = async (p) => { try { const r = await apiClient.get(`/accounts/periods/${p.ym}/verify`); if (r.data.ok) toast.success(`${ymName(p.ym)} matches what was signed off.`); else toast.error(`${ymName(p.ym)} no longer matches what was signed off. Run the check under “Chart and rules”.`, { duration: 9000 }); } catch (e) { toast.error(errMsg(e)); } };
  const rows = g.data ? g.data.rows.slice().reverse() : []; const latestClosed = rows.find((p) => p.status === 'closed');
  return (
    <div className="space-y-3">
      <Card><p className="text-sm text-[#3b4a5c]">Closing a month locks it. Nothing can be posted into it, and a fingerprint of the books is kept so a later change would show. Months close in order. Someone prepares the close and someone else signs it off. Only an administrator can reopen the latest closed month, with a reason.</p></Card>
      <Loading g={g}>{g.data && (
        <Table label="Months" head={['Month', 'Year', 'Entries', 'State', 'Closed by', '']} min={760}>{rows.map((p) => (
          <tr key={p.ym}><Td><b>{p.name}</b></Td><Td className="text-xs">{p.fy}</Td><Td className="text-end"><Num v={p.lines} /></Td><Td><ABadge k="period" s={p.status} />{p.status === 'closing' && p.requestedByName && <div className="text-xs text-[#5b6b7b]">Asked by {p.requestedByName}</div>}</Td><Td className="text-xs">{p.closedByName ? `${p.closedByName}${p.closedAt ? ` · ${day(p.closedAt)}` : ''}${p.sole ? ' (only administrator)' : ''}` : ''}</Td>
            <Td><span className="flex flex-wrap gap-1">
              {p.status === 'open' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => look(p)} aria-label={`Check ${p.name}`}>Check</button>}
              {t.prepare && p.status === 'open' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post(`/accounts/periods/${p.ym}/close`, {}), 'Asked for sign-off.', p.ym)} aria-label={`Ask to close ${p.name}`}>Ask to close</button>}
              {t.prepare && p.status === 'closing' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post(`/accounts/periods/${p.ym}/cancel`, {}), 'Withdrawn.')}>Withdraw</button>}
              {t.approve && p.status === 'closing' && <button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={() => act(() => apiClient.post(`/accounts/periods/${p.ym}/approve`, {}), 'Month closed.', p.ym)} aria-label={`Sign off ${p.name}`}>Sign off</button>}
              {p.status === 'closed' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => verify(p)} aria-label={`Verify ${p.name}`}>Verify</button>}
              {t.admin && latestClosed && latestClosed.ym === p.ym && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk(p)} aria-label={`Reopen ${p.name}`}>Reopen</button>}
              {p.history?.length > 0 && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setList(p)} aria-label={`History of ${p.name}`}>History</button>}</span></Td></tr>))}</Table>)}</Loading>
      {chk && <Modal title={`Closing ${ymName(chk.ym)}`} onClose={() => setChk(null)}><div className="space-y-2">{chk.blockers.length === 0 && <Note tone="good">Nothing stops this month from closing.</Note>}{chk.blockers.length > 0 && <Note tone="warn"><b>These must be fixed first:</b><ul className="list-disc ps-5">{chk.blockers.map((b) => <li key={b}>{b}</li>)}</ul></Note>}{chk.warnings.length > 0 && <Note tone="info"><b>Worth a look:</b><ul className="list-disc ps-5">{chk.warnings.map((b) => <li key={b}>{b}</li>)}</ul></Note>}<p className="text-sm text-[#5b6b7b]">The trial balance {chk.trialBalanced ? 'balances' : 'does not balance'}.</p></div></Modal>}
      {list && <Modal title={`History of ${list.name}`} onClose={() => setList(null)}><Trail rows={list.history} /></Modal>}
      {ask && <Reason title={`Reopen ${ask.name}`} text="The month’s fingerprint is thrown away and entries can be posted into it again. Everyone with approval rights is told." confirm="Reopen the month" min={10} label="Why it needs to be reopened (at least 10 letters)" onClose={() => setAsk(null)} onDone={async (reason) => { await apiClient.post(`/accounts/periods/${ask.ym}/reopen`, { reason }); setAsk(null); toast.success('Reopened.'); g.reload(); }} />}
    </div>
  );
}
