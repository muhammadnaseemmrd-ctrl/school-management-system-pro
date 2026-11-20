import React, { useEffect, useState } from 'react';
import usePlan from '../../utils/usePlan';
import { useGet, Tabs, Note } from './commsKit';
import Conversations from './Conversations';
import { FamilyHelp } from './HelpDesk';
import { MeetingsFamily } from './Meetings';
import { Preferences } from './CommsSettings';

// A parent's messages, help requests, meeting bookings and alert settings
export default function FamilyMessages() {
  const ov = useGet('/comms/overview'); const [tab, setTab] = useState('messages'); const o = ov.data;
  useEffect(() => { ov.reload(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const { has } = usePlan();
  if (!has('messages')) return <Note>Messages are not switched on for your school.</Note>;
  return (
    <div className="grid gap-4">
      {o && o.ticketsWaitingOnMe > 0 && <Note tone="warn">The school is waiting for your reply on {o.ticketsWaitingOnMe} help {o.ticketsWaitingOnMe === 1 ? 'request' : 'requests'}.</Note>}
      <Tabs label="Messages and help" value={tab} onChange={setTab} items={[['messages', 'Messages', o?.unreadThreads], ['help', 'Help requests', o?.ticketsOpen], ['meetings', 'Meetings', o?.meetings], ['prefs', 'My alerts']]} />
      {tab === 'messages' && <Conversations role="parent" onChanged={ov.reload} />}
      {tab === 'help' && <FamilyHelp onChanged={ov.reload} />}
      {tab === 'meetings' && <MeetingsFamily onChanged={ov.reload} />}
      {tab === 'prefs' && <Preferences />}
    </div>
  );
}
