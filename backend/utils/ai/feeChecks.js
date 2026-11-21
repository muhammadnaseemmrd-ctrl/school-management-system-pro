// Fee checks (PRD E31, CAP-0501): things that look odd in the fee records, each with the reason in plain words. Nothing is changed.
// An administrator marks one as checked with a note; it then stays out of the list.
const FeePayment = require('../../models/FeePayment');
const FeeAdjustment = require('../../models/FeeAdjustment');
const FeeInvoice = require('../../models/FeeInvoice');
const Student = require('../../models/Student');
const AiAudit = require('../../models/AiAudit');
const { sha } = require('./builtin');

const rs = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
async function find(schoolId, { days = 60 } = {}) {
  const since = new Date(Date.now() - days * 86400000); const out = [];
  const pay = await FeePayment.find({ schoolId, status: 'Confirmed', receivedAt: { $gte: since } }).sort({ receivedAt: 1 }).limit(3000).lean();
  const names = new Map(); const nameOf = async (ids) => { const need = [...new Set(ids.map(String))].filter((i) => !names.has(i)); if (need.length) for (const s of await Student.find({ _id: { $in: need }, schoolId }).select('name').lean()) names.set(String(s._id), s.name); return (id) => names.get(String(id)) || 'a student'; };
  // the same child paid the same amount twice within two days
  const byKey = new Map(); for (const p of pay) { const k = `${p.studentId}|${p.amount}`; (byKey.get(k) || byKey.set(k, []).get(k)).push(p); }
  const dupes = [];
  for (const list of byKey.values()) for (let i = 1; i < list.length; i++) if (new Date(list[i].receivedAt) - new Date(list[i - 1].receivedAt) <= 48 * 3600000) dupes.push([list[i - 1], list[i]]);
  // one bank or wallet reference used for different children
  const refs = new Map(); for (const p of pay) if (p.reference && p.method !== 'cash') { const k = `${p.method}|${String(p.reference).trim().toLowerCase()}`; (refs.get(k) || refs.set(k, []).get(k)).push(p); }
  const reused = [...refs.values()].filter((l) => new Set(l.map((p) => String(p.studentId))).size >= 2);
  const adj = await FeeAdjustment.find({ schoolId, status: 'Approved', type: { $in: ['concession', 'credit-note'] }, createdAt: { $gte: since }, invoiceId: { $ne: null } }).lean();
  const byInv = new Map(); for (const a of adj) (byInv.get(String(a.invoiceId)) || byInv.set(String(a.invoiceId), []).get(String(a.invoiceId))).push(a);
  const invIds = [...byInv.keys()]; const invs = invIds.length ? await FeeInvoice.find({ schoolId, _id: { $in: invIds } }).select('number total studentId').lean() : []; const invMap = new Map(invs.map((i) => [String(i._id), i]));
  const nm = await nameOf([...dupes.flat().map((p) => p.studentId), ...reused.flat().map((p) => p.studentId), ...invs.map((i) => i.studentId)]);
  for (const [a, b] of dupes) out.push({ key: sha(`dup|${a._id}|${b._id}`).slice(0, 16), code: 'duplicate_payment', severity: 'warn', studentId: String(a.studentId), why: `${nm(a.studentId)} paid ${rs(a.amount)} twice within two days (receipts ${a.receiptNo || 'none'} and ${b.receiptNo || 'none'}). It may be a double payment.`, ids: [String(a._id), String(b._id)] });
  for (const l of reused) { const ids = l.map((p) => String(p._id)).sort(); out.push({ key: sha(`ref|${ids.join(',')}`).slice(0, 16), code: 'reference_reused', severity: 'warn', why: `The ${l[0].method} reference "${l[0].reference}" was used for ${new Set(l.map((p) => String(p.studentId))).size} different children (${[...new Set(l.map((p) => nm(p.studentId)))].join(', ')}). A reference should belong to one payment.`, ids }); }
  for (const [iid, list] of byInv) {
    const inv = invMap.get(iid);
    if (list.length >= 2) out.push({ key: sha(`rep|${iid}|${list.length}`).slice(0, 16), code: 'repeat_concession', severity: 'warn', studentId: inv ? String(inv.studentId) : '', why: `Invoice ${inv?.number || ''} has ${list.length} approved concessions or credit notes (${rs(list.reduce((s, x) => s + x.amount, 0))} in all).`, ids: list.map((x) => String(x._id)) });
    const sum = list.reduce((s, x) => s + x.amount, 0); if (inv && inv.total > 0 && sum > inv.total * 0.5) out.push({ key: sha(`big|${iid}|${sum}`).slice(0, 16), code: 'large_concession', severity: 'warn', studentId: String(inv.studentId), why: `Concessions on invoice ${inv.number} come to ${rs(sum)}, more than half of its ${rs(inv.total)}.`, ids: list.map((x) => String(x._id)) });
  }
  const done = new Set((await AiAudit.find({ schoolId, action: 'fee_check' }).select('draftNo').lean()).map((r) => r.draftNo));
  return out.filter((e) => !done.has(e.key));
}
module.exports = { find };
