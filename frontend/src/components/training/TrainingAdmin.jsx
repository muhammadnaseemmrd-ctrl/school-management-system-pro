import React, { useState } from 'react';
import { Card, Stat, Pill } from '../ui';
import { useGet, Loading, Note, Tabs, money, dt } from './tkit';
import { Courses, Instructors } from './Courses';
import { Cohorts } from './Cohorts';
import { Orders, Learners } from './Orders';
import { Sponsors } from './Sponsors';
import { Coupons, Bundles } from './Offers';
import { Reports, TrainingSettings } from './Reports';
import { Completions, Submissions, Certificates, Discussion, Slots } from './Reviews';

export default function TrainingAdmin() {
  const [top, setTop] = useState('overview'); const [sub, setSub] = useState({ courses: 'courses', sales: 'orders', reviews: 'completions', setup: 'settings' });
  const ov = useGet('/training/overview'); const d = ov.data; const c = d?.counts || {};
  const go = (t, s) => { setTop(t); if (s) setSub((x) => ({ ...x, [t]: s })); };
  const setS = (t) => (v) => setSub((x) => ({ ...x, [t]: v }));
  const reviewBadge = d ? c.completionsReady + c.submissionsWaiting + c.postsHeld + c.postsReported : 0;
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">Training</h2><p className="text-sm text-[#5b6b7b]">Courses for people outside your normal classes: write them, run cohorts, take payment, review work and issue certificates anyone can check.</p></div>
      <Tabs label="Training sections" value={top} onChange={setTop} items={[['overview', 'Overview', (c.proofsWaiting || 0) + reviewBadge || null], ['courses', 'Courses'], ['cohorts', 'Cohorts'], ['sales', 'Sales', c.proofsWaiting || null], ['reviews', 'Reviews', reviewBadge || null], ['reports', 'Reports'], ['setup', 'Setup']]} />
      {top === 'overview' && (
        <Loading g={ov}>{d && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Courses" value={c.courses} sub={`${c.published} on sale`} /><Stat label="Learners" value={c.learners} sub={`${c.activeEnt} with access now`} /><Stat label="Open cohorts" value={c.openCohorts} /><Stat label="Received this month" value={money(d.collectedThisMonth, d.settings.currency)} sub={`${c.credentials} certificates issued`} />
            </div>
            <Card>
              <h3 className="mb-2 font-semibold text-[#1b2837]">Waiting for you</h3>
              <ul className="grid gap-2 text-sm">
                {[['Payment proof to check', c.proofsWaiting, 'sales', 'orders'], ['Instalments overdue', c.instalmentsOverdue, 'sales', 'orders'], ['Work to review', c.submissionsWaiting, 'reviews', 'submissions'], ['Finished courses to approve', c.completionsReady, 'reviews', 'completions'], ['Discussion posts to approve', c.postsHeld, 'reviews', 'discussion'], ['Reported posts', c.postsReported, 'reviews', 'discussion'], ['Sponsor invoices unpaid', c.sponsorshipsUnpaid, 'sales', 'sponsors']].map(([label, n, t, s]) => (
                  <li key={label} className="flex items-center justify-between gap-2"><span>{label}</span><span className="flex items-center gap-2">{n ? <Pill value="Pending">{n}</Pill> : <span className="text-xs text-[#5b6b7b]">None</span>}{n ? <button className="text-xs font-semibold text-[#2a5cac] underline" onClick={() => go(t, s)} aria-label={`Open ${label}`}>Open</button> : null}</span></li>
                ))}
              </ul>
            </Card>
            {d.proofs.length > 0 && (
              <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Oldest payment proofs</h3><ul className="grid gap-1 text-sm">{d.proofs.map((p) => <li key={`${p.orderId}-${p.no}`} className="flex flex-wrap justify-between gap-2"><span><span className="font-mono text-xs">{p.orderNo}</span> · {p.title} · instalment {p.no}</span><span className="text-xs text-[#5b6b7b]">{money(p.amount, d.settings.currency)} · {dt(p.at)}</span></li>)}</ul></Card>
            )}
            {!d.settings.storefront.enabled && <Note>Your public course page is switched off. Publish a course, then turn it on in Setup so people can find and buy it.</Note>}
          </div>
        )}</Loading>
      )}
      {top === 'courses' && (<><Tabs label="Course sections" value={sub.courses} onChange={setS('courses')} items={[['courses', 'Courses'], ['instructors', 'Instructors'], ['bundles', 'Bundles and paths']]} />{sub.courses === 'courses' && <Courses role="admin" soleAdmin={d?.soleAdmin} />}{sub.courses === 'instructors' && <Instructors />}{sub.courses === 'bundles' && <Bundles />}</>)}
      {top === 'cohorts' && <Cohorts admin />}
      {top === 'sales' && (<><Tabs label="Sales sections" value={sub.sales} onChange={setS('sales')} items={[['orders', 'Orders and payments', c.proofsWaiting || null], ['learners', 'Learners'], ['sponsors', 'Sponsors and invoices'], ['codes', 'Discount codes']]} />{sub.sales === 'orders' && <Orders onProofChange={ov.reload} />}{sub.sales === 'learners' && <Learners />}{sub.sales === 'sponsors' && <Sponsors />}{sub.sales === 'codes' && <Coupons />}</>)}
      {top === 'reviews' && (<><Tabs label="Review sections" value={sub.reviews} onChange={setS('reviews')} items={[['completions', 'Finished courses', c.completionsReady || null], ['submissions', 'Hand-ins', c.submissionsWaiting || null], ['certificates', 'Certificates'], ['discussion', 'Discussion', (c.postsHeld || 0) + (c.postsReported || 0) || null], ['slots', 'Office hours']]} />{sub.reviews === 'completions' && <Completions />}{sub.reviews === 'submissions' && <Submissions />}{sub.reviews === 'certificates' && <Certificates admin />}{sub.reviews === 'discussion' && <Discussion />}{sub.reviews === 'slots' && <Slots admin />}</>)}
      {top === 'reports' && <Reports />}
      {top === 'setup' && <TrainingSettings onSaved={ov.reload} />}
    </div>
  );
}
