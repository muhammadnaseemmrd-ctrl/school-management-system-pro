// Money that is set aside, then spent (PRD E19). Every draw is checked against the approved budget line, the fund and the project, and each pot moves by a conditional write so two people cannot spend the same money.
const S = require('./service');
const PcBudget = require('../../models/PcBudget'); const PcBudgetLine = require('../../models/PcBudgetLine'); const PcFund = require('../../models/PcFund'); const PcFundEntry = require('../../models/PcFundEntry'); const PcProject = require('../../models/PcProject');
const { Fail, E } = S;

// May money be drawn for this purpose, on this day? Nothing is changed here.
async function check(ctx, { lineId, fundId, projectId, category, at, amount = 0 }) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings;
  const line = S.oid(lineId) ? await PcBudgetLine.findOne({ _id: lineId, schoolId: ctx.schoolId }) : null;
  if (!line) throw new Fail(422, 'Choose the budget this will be paid from.', { reason: 'budget' });
  const budget = await PcBudget.findOne({ _id: line.budgetId, schoolId: ctx.schoolId });
  if (!budget || budget.status !== 'approved') throw new Fail(422, 'That budget has not been approved, or is closed, so nothing can be spent from it.', { reason: 'budget' });
  if (category && line.category !== category) throw new Fail(422, `That budget line is for ${line.category}, not ${category}.`, { reason: 'budget' });
  const yr = E.yearRange(budget.year, cfg.fiscalYearStartMonth);
  if (yr && at && (at < yr.from || at > yr.to)) throw new Fail(422, `That budget is for ${budget.year}.`, { reason: 'budget' });
  let fund = null; let project = null;
  if (fundId) {
    fund = S.oid(fundId) ? await PcFund.findOne({ _id: fundId, schoolId: ctx.schoolId }) : null;
    if (!fund) throw new Fail(422, 'That fund is not in your school.', { reason: 'fund' });
    if (fund.status !== 'active') throw new Fail(422, `The fund “${fund.name}” is closed.`, { reason: 'fund' });
    if (fund.allowed?.length && !fund.allowed.includes(line.category)) throw new Fail(422, `The fund “${fund.name}” cannot pay for ${line.category}. It allows: ${fund.allowed.join(', ')}.`, { reason: 'fund' });
    if (at && ((fund.validFrom && at < fund.validFrom.toISOString().slice(0, 10)) || (fund.validTo && at > fund.validTo.toISOString().slice(0, 10)))) throw new Fail(422, `The fund “${fund.name}” cannot be spent on this date.`, { reason: 'fund' });
  }
  if (projectId) {
    project = S.oid(projectId) ? await PcProject.findOne({ _id: projectId, schoolId: ctx.schoolId }) : null;
    if (!project) throw new Fail(422, 'That project is not in your school.', { reason: 'project' });
    if (!['approved', 'building', 'handover'].includes(project.phase)) throw new Fail(422, `The project “${project.title}” is ${project.phase}, so it cannot take new spending.`, { reason: 'project' });
  }
  const short = (what, have) => new Fail(409, `${what} has ${S.money(have)} left, which is not enough for ${S.money(amount)}.`, { reason: what.startsWith('The fund') ? 'fund' : what.startsWith('The project') ? 'project' : 'budget', left: have });
  if (amount > 0) {
    if (line.available < amount) throw short(`The ${line.category} budget`, line.available);
    if (fund && fund.available < amount) throw short(`The fund “${fund.name}”`, fund.available);
    if (project && project.available < amount) throw short(`The project “${project.title}”`, project.available);
  }
  return { line, budget, fund, project };
}

const step = async (Model, ctx, id, dc, ds) => {
  const net = dc + ds; const f = { _id: id, schoolId: ctx.schoolId };
  if (net > 0) f.available = { $gte: net }; if (dc < 0) f.committed = { $gte: -dc }; if (ds < 0) f.spent = { $gte: -ds };
  return !!(await Model.updateOne(f, { $inc: { committed: dc, spent: ds, available: -net } })).matchedCount;
};
// Move money in all of the pots a purchase belongs to. dc is the change in what is set aside, ds the change in what is spent. All or nothing.
async function move(ctx, t, { dc = 0, ds = 0 }, ref = {}) {
  const parts = [['line', PcBudgetLine, t.lineId], ['fund', PcFund, t.fundId], ['project', PcProject, t.projectId]].filter((p) => p[2]); const done = [];
  for (const [name, Model, id] of parts) {
    if (!(await step(Model, ctx, id, dc, ds))) {
      for (const d of done.reverse()) await step(d.Model, ctx, d.id, -dc, -ds);
      const what = name === 'line' ? 'The budget' : name === 'fund' ? 'The fund' : 'The project'; throw new Fail(409, `${what} no longer has enough left for this. Nothing was changed.`, { reason: name === 'line' ? 'budget' : name });
    }
    done.push({ Model, id });
  }
  if (t.fundId) {
    const kind = ds < 0 ? 'refund' : ds > 0 ? 'spend' : dc > 0 ? 'commit' : 'release'; const net = dc + ds; const f = await PcFund.findOne({ _id: t.fundId, schoolId: ctx.schoolId }).select('available');
    await PcFundEntry.create({ schoolId: ctx.schoolId, fundId: t.fundId, kind, amount: Math.abs(ds || dc), delta: -net, refType: ref.type || '', refId: ref.id || null, refNo: ref.no || '', note: ref.note || '', balanceAfter: f?.available ?? 0, byId: ctx.actor?.id || null, byName: ctx.actor?.name || '' });
  }
  return true;
}
const commit = (ctx, t, amount, ref) => move(ctx, t, { dc: amount }, ref);
const release = (ctx, t, amount, ref) => (amount > 0 ? move(ctx, t, { dc: -amount }, ref) : true);
// Paying a bill turns the set-aside money into spent money; anything above what was set aside must also be available.
const spend = (ctx, t, amount, fromCommitted, ref) => move(ctx, t, { dc: -fromCommitted, ds: amount }, ref);

// Money received into a fund, or corrected by another entry.
async function receive(ctx, fundId, amount, { kind = 'receipt', note = '', refNo = '' } = {}) {
  const f = { _id: fundId, schoolId: ctx.schoolId }; if (amount < 0) f.available = { $gte: -amount };
  const done = await PcFund.updateOne(f, { $inc: { received: amount, available: amount } }); if (!done.matchedCount) throw new Fail(409, 'The fund does not have that much available to take back.', { reason: 'fund' });
  const after = await PcFund.findOne({ _id: fundId, schoolId: ctx.schoolId }).select('available');
  await PcFundEntry.create({ schoolId: ctx.schoolId, fundId, kind, amount: Math.abs(amount), delta: amount, refNo, note, balanceAfter: after?.available ?? 0, byId: ctx.actor?.id || null, byName: ctx.actor?.name || '' });
  return after;
}
// Does every fund and line balance with what its entries say?
async function reconcile(schoolId) {
  const bad = [];
  for (const f of await PcFund.find({ schoolId })) {
    if (f.received - f.committed - f.spent !== f.available) bad.push({ kind: 'fund', id: String(f._id), name: f.name, why: 'available does not equal received less committed and spent' });
    const ents = await PcFundEntry.find({ schoolId, fundId: f._id }); const sum = ents.reduce((s, e) => s + e.delta, 0); if (sum !== f.available) bad.push({ kind: 'fund', id: String(f._id), name: f.name, why: `entries add up to ${sum}, not ${f.available}` });
  }
  for (const l of await PcBudgetLine.find({ schoolId })) if (l.amount - l.committed - l.spent !== l.available) bad.push({ kind: 'line', id: String(l._id), name: l.category, why: 'available does not equal the amount less committed and spent' });
  for (const p of await PcProject.find({ schoolId })) if (p.authorized - p.committed - p.spent !== p.available) bad.push({ kind: 'project', id: String(p._id), name: p.title, why: 'available does not equal authorised less committed and spent' });
  return { ok: !bad.length, problems: bad };
}
module.exports = { check, move, commit, release, spend, receive, reconcile };
