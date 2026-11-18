// Platform double-entry ledger (E02). Whole PKR. Posting is idempotent per (sourceType, sourceId)
// and refuses unbalanced entries.
const LedgerJournal = require('../models/LedgerJournal');

const ACCOUNTS = {
  BANK: '1000',          // money Aulensia holds (bank, wallets, cash)
  COMMISSION_DUE: '2000', // owed to agents
  REVENUE: '4000',       // subscription revenue
  COMMISSION_COST: '5000',
};
const ACCOUNT_NAMES = {
  '1000': 'Bank and cash', '2000': 'Commissions payable', '4000': 'Subscription revenue', '5000': 'Commission expense',
};

// lines: [{ account, debit?, credit? }]. Returns { journal, created }.
async function post({ sourceType, sourceId, memo = '', lines, postedAt }) {
  const clean = (lines || []).map((l) => ({ account: String(l.account), debit: Math.round(l.debit || 0), credit: Math.round(l.credit || 0) }))
    .filter((l) => l.debit || l.credit);
  const dr = clean.reduce((s, l) => s + l.debit, 0);
  const cr = clean.reduce((s, l) => s + l.credit, 0);
  if (!clean.length || dr !== cr) throw new Error(`Unbalanced journal for ${sourceType}:${sourceId} (debit ${dr}, credit ${cr})`);
  if (clean.some((l) => l.debit && l.credit)) throw new Error('A journal line cannot have both debit and credit');
  const key = { sourceType, sourceId: String(sourceId) };
  const existing = await LedgerJournal.findOne(key);
  if (existing) return { journal: existing, created: false };
  try {
    const journal = await LedgerJournal.create({ ...key, memo, lines: clean, postedAt: postedAt || new Date() });
    return { journal, created: true };
  } catch (e) {
    // a concurrent retry won the race on the unique (sourceType, sourceId) index
    const again = await LedgerJournal.findOne(key);
    if (again) return { journal: again, created: false };
    throw e;
  }
}

// Account balances: balance is positive in the account's natural direction. One SQL pass over the journal lines.
async function trialBalance() {
  const db = require('../lib/pgdoc').db;
  const { rows } = await db.get().query(
    `SELECT l->>'account' AS account,
            COALESCE(SUM((l->>'debit')::numeric), 0)::float8 AS debit,
            COALESCE(SUM((l->>'credit')::numeric), 0)::float8 AS credit
       FROM ${LedgerJournal.table} j, jsonb_array_elements(j.doc->'lines') AS l
      WHERE j.doc->>'status' IS DISTINCT FROM 'reversed'
      GROUP BY 1`);
  const out = {};
  Object.keys(ACCOUNT_NAMES).forEach((c) => { out[c] = { code: c, name: ACCOUNT_NAMES[c], debit: 0, credit: 0, balance: 0 }; });
  rows.forEach((r) => {
    const entry = out[r.account] || (out[r.account] = { code: r.account, name: r.account, debit: 0, credit: 0, balance: 0 });
    entry.debit = Number(r.debit); entry.credit = Number(r.credit);
  });
  Object.values(out).forEach((a) => {
    const debitNormal = a.code.startsWith('1') || a.code.startsWith('5');
    a.balance = debitNormal ? a.debit - a.credit : a.credit - a.debit;
  });
  const totalDebit = Object.values(out).reduce((s, a) => s + a.debit, 0);
  const totalCredit = Object.values(out).reduce((s, a) => s + a.credit, 0);
  return { accounts: Object.values(out).sort((a, b) => a.code.localeCompare(b.code)), totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

module.exports = { ACCOUNTS, ACCOUNT_NAMES, post, trialBalance };
