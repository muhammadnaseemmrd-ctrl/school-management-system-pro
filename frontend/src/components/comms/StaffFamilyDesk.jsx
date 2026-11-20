import React, { useEffect, useState } from 'react';
import { Stat } from '../ui';
import usePlan from '../../utils/usePlan';
import { useGet, Tabs, Note } from './commsKit';
import Conversations from './Conversations';
import HelpDeskAdmin from './HelpDesk';
import MeetingsStaff from './Meetings';
import CommsSettings, { Preferences } from './CommsSettings';

// Messages, help desk and meeting days for the people at the school
export default function StaffFamilyDesk({ isAdmin = false }) {
  const ov = useGet('/comms/overview'); const [tab, setTab] = useState(() => (window.location.hash.includes('help') && isAdmin ? 'help' : 'messages')); const o = ov.data;
  useEffect(() => { ov.reload(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const { has } = usePlan();
  if (!has('messages')) return <Note>Family messages, the help desk and meeting days are not part of your school's current plan.</Note>;
  const items = [['messages', 'Messages', o?.unreadThreads], ...(isAdmin ? [['help', 'Help desk', (o?.ticketsBreached || 0) + (o?.ticketsUnassigned || 0)]] : []), ['meetings', 'Meetings'], ['prefs', 'My alerts'], ...(isAdmin ? [['settings', 'Settings']] : [])];
  return (
    <div className="grid gap-4">
      {o && <div className={`grid grid-cols-2 gap-3 ${isAdmin ? 'sm:grid-cols-5' : 'sm:grid-cols-3'}`}><Stat label="Unread messages" value={o.unreadThreads} /><Stat label="Waiting too long" value={o.overdueThreads} sub="family messages without a reply" tone={o.overdueThreads ? 'text-[#9f1239]' : undefined} /><Stat label="Meetings coming up" value={o.meetings} />{isAdmin && <><Stat label="Help requests open" value={o.ticketsOpen} sub={`${o.ticketsUnassigned} nobody has taken`} /><Stat label="Past deadline" value={o.ticketsBreached} tone={o.ticketsBreached ? 'text-[#9f1239]' : undefined} /></>}</div>}
      {isAdmin && o && (o.held > 0 || o.failed > 0) && <Note>{o.held > 0 && `${o.held} phone alerts are being held for quiet hours. `}{o.failed > 0 && `${o.failed} phone alerts failed and will be tried again.`}</Note>}
      <Tabs label="Family communication" value={tab} onChange={setTab} items={items} />
      {tab === 'messages' && <Conversations role={isAdmin ? 'admin' : 'teacher'} onChanged={ov.reload} />}
      {tab === 'help' && isAdmin && <HelpDeskAdmin onChanged={ov.reload} />}
      {tab === 'meetings' && <MeetingsStaff isAdmin={isAdmin} onChanged={ov.reload} />}
      {tab === 'prefs' && <Preferences />}
      {tab === 'settings' && isAdmin && <CommsSettings />}
    </div>
  );
}
