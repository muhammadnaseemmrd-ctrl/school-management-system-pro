import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, btnPrimary } from '../ui';
import apiClient from '../../utils/apiClient';
import { useGet, Tag } from './iKit';

// Learning tools the school has switched on. Opening one signs the person in to the tool without a second password; the tool is told only what is listed.
export default function LearningTools({ classId }) {
  const g = useGet('/lti/tools'); const [busy, setBusy] = useState('');
  const open = async (t) => {
    setBusy(t.id);
    const win = window.open('', '_blank');                       // opened first, inside the click, so the browser does not block it
    try {
      const r = await apiClient.post(`/lti/launch/${t.id}`, classId ? { classId } : {});
      if (win) win.location.href = r.data.begin; else window.location.href = r.data.begin;
    } catch (e) { if (win) win.close(); toast.error(e.response?.data?.error_description || e.response?.data?.message || 'The tool could not be opened.'); }
    setBusy('');
  };
  if (!g.data || g.data.tools.length === 0) return null;
  return (
    <Card>
      <h2 className="text-sm font-bold text-[#1b2837]">Learning tools</h2>
      <ul className="mt-2 divide-y divide-[#eef0f0]">{g.data.tools.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div><p className="text-sm font-semibold text-[#1b2837]">{t.name}</p><p className="text-xs text-[#5b6b7b]">{t.purpose}</p><p className="mt-1 text-[11px] text-[#5b6b7b]">It is told: {['an ID that only this tool sees', 'your role', ...t.shares].join(', ')}</p></div>
          <button className={btnPrimary} onClick={() => open(t)} disabled={busy === t.id} aria-label={`Open ${t.name}`}>{busy === t.id ? 'Opening…' : 'Open'}</button>
        </li>))}</ul>
    </Card>
  );
}
