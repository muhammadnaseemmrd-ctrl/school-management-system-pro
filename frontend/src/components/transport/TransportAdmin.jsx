import React, { useState } from 'react';
import { Tabs } from './tpKit';
import Today from './Today';
import Trips from './Trips';
import Routes from './Routes';
import Riders from './Riders';
import { Vehicles, Drivers, Inspections } from './Fleet';
import Incidents from './Incidents';
import TpReports from './TpReports';
import TpSetup from './TpSetup';

// The transport office. An administrator has everything. A teacher with a dispatcher permission sees the day, trips, children, incidents and reports;
// one with a manager permission can also plan routes, manage the fleet and drivers, and record inspections.
export default function TransportAdmin({ admin = true, manage = true, dispatch = true }) {
  const [tab, setTab] = useState('today'); const [veh, setVeh] = useState('');
  const go = (t, v) => { setTab(t); if (v) setVeh(v); };
  const items = [['today', 'Today'], ['trips', 'Trips'], ['routes', 'Routes and stops'], ['riders', 'Children'], ['vehicles', 'Vehicles'], ['drivers', 'Drivers'], ...(manage ? [['inspections', 'Inspections']] : []), ['incidents', 'Incidents'], ['reports', 'Reports'], ...(manage ? [['rules', 'Rules']] : [])];
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">School transport</h2><p className="text-sm text-[#5b6b7b]">Plan routes and runs, watch each trip, and keep every child accounted for from the stop to the school gate and back.{!admin && ' You are working here under a permission an administrator gave you for a limited time.'}</p></div>
      <Tabs label="Transport sections" value={tab} onChange={setTab} items={items} />
      {tab === 'today' && <Today go={go} />}
      {tab === 'trips' && <Trips manage={dispatch} />}
      {tab === 'routes' && <Routes manage={manage} />}
      {tab === 'riders' && <Riders manage={manage} />}
      {tab === 'vehicles' && <Vehicles manage={manage} go={go} />}
      {tab === 'drivers' && <Drivers manage={manage} />}
      {tab === 'inspections' && <Inspections manage={manage} vehicleId={veh} key={veh} />}
      {tab === 'incidents' && <Incidents />}
      {tab === 'reports' && <TpReports />}
      {tab === 'rules' && <TpSetup admin={admin} />}
    </div>
  );
}
