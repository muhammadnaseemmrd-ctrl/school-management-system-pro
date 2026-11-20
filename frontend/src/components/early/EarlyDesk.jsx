import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Card, EmptyState, Stat, btnGhost, inputCls } from '../ui';
import { useGet, Loading, Note, Tabs } from './earlyKit';
import RoomToday from './RoomToday';
import DiaryDesk from './DiaryDesk';
import LearnDesk from './LearnDesk';
import ActivityDesk from './ActivityDesk';
import PickupDesk from './PickupDesk';
import RoomsAdmin from './RoomsAdmin';

// Nursery and early years: the room today, the family diary, milestones, activities, and who may collect each child
export default function EarlyDesk({ isAdmin = false }) {
  const user = useSelector((s) => s.auth.user); const me = String(user?._id || user?.id || '');
  const ov = useGet('/early/overview'); const rooms = useGet('/early/rooms'); const [roomId, setRoomId] = useState(''); const [tab, setTab] = useState('today');
  const list = rooms.data?.rooms || [];
  useEffect(() => { ov.reload(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!roomId && list.length) setRoomId(list[0]._id); }, [list, roomId]);
  const room = list.find((r) => r._id === roomId); const isLead = isAdmin || (room?.lead && String(room.lead._id) === me); const o = ov.data;
  const items = [['today', 'Today'], ['diary', 'Family diary', o?.diariesWaiting], ['learning', 'Learning'], ['activities', 'Activities'], ['pickup', 'Pickup changes', o?.pickupChangesWaiting], ...(isAdmin ? [['rooms', 'Rooms and settings']] : [])];
  return (
    <div className="grid gap-4">
      {o && <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Children" value={o.children} /><Stat label="Here now" value={o.in} /><Stat label="Expected" value={o.expected} /><Stat label="Absent" value={o.absent} /><Stat label="Rooms needing adults" value={o.ratioProblems} tone={o.ratioProblems ? 'text-[#9f1239]' : 'text-[#1b2837]'} /></div>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="ey-room">Room<select id="ey-room" className={`${inputCls} w-56`} value={roomId} onChange={(e) => setRoomId(e.target.value)}>{list.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></label>
        {room && <span className="text-xs text-[#5b6b7b]">{room.bandLabel} · lead: {room.lead?.name || 'not set'}</span>}
      </div>
      <Tabs label="Nursery" value={tab} onChange={setTab} items={items} />
      {tab === 'rooms' ? <RoomsAdmin /> : tab === 'pickup' ? <PickupDesk isLead={isLead || isAdmin} /> : (
        <Loading g={rooms}>{!roomId ? <Card><EmptyState title="No nursery room yet" text={isAdmin ? 'Open Rooms and settings to create a room and place children in it.' : 'An administrator will add you to a room.'} action={isAdmin ? <button className={btnGhost} onClick={() => setTab('rooms')}>Rooms and settings</button> : null} /></Card> : (
          <div key={roomId}>
            {tab === 'today' && <RoomToday roomId={roomId} me={me} isTeacher={!isAdmin} isLead={isLead} />}
            {tab === 'diary' && <DiaryDesk roomId={roomId} me={me} isLead={isLead} />}
            {tab === 'learning' && <LearnDesk roomId={roomId} isAdmin={isAdmin} />}
            {tab === 'activities' && <ActivityDesk roomId={roomId} isAdmin={isAdmin} />}
          </div>)}</Loading>)}
    </div>
  );
}
