import React, { useState } from 'react';
import { useGet, Tabs, Loading, Note } from './advKit';
import Alumni from './Alumni';
import Giving from './Giving';
import Quality from './Quality';
import Board from './Board';
import { ServiceStaff } from './Service';
import Report from './Report';

// Alumni, giving, quality, the board, service hours and the annual report (PRD E32). What a person sees depends on what they were given.
export default function AdvancementHub() {
  const [tab, setTab] = useState(null); const me = useGet('/advancement/me', {});
  const d = me.data; const can = d ? { alumni: d.alumni, giving: d.giving, quality: d.quality, board: !!d.board || d.wide, report: d.wide } : {};
  const items = [['alumni', 'Alumni'], ['giving', 'Giving'], ['quality', 'Quality'], ['board', 'Board'], ['service', 'Service hours'], ['report', 'Annual report']].filter(([k]) => (k === 'service' ? can.quality : can[k]));
  const cur = tab && items.some(([k]) => k === tab) ? tab : items[0]?.[0];
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-[#1b2837]">Alumni, giving and quality</h1><p className="mt-1 text-sm text-[#5b6b7b]">Graduates who joined by choice, gifts kept in separate funds, standards backed by checked evidence, board papers, student service and the annual report.</p></div>
      <Loading g={me}>{d && (items.length === 0 ? <Note>You have not been given any part of this. An administrator can give you alumni, giving or quality access.</Note> : (<>
        <Tabs label="Sections" value={cur} onChange={setTab} items={items} />
        <div key={cur}>
          {cur === 'alumni' && <Alumni />}{cur === 'giving' && <Giving wide={d.wide} />}{cur === 'quality' && <Quality />}{cur === 'board' && <Board me={d.board} wide={d.wide} />}{cur === 'service' && <ServiceStaff />}{cur === 'report' && <Report />}
        </div></>))}</Loading>
    </div>
  );
}
