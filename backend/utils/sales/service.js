// Shared helpers for sales, quotes, invoices and customer support (PRD E28).
const crypto = require('crypto');
const mongoose = require('../../lib/pgdoc');
const PlatformCounter = require('../../models/PlatformCounter');
const AppSetting = require('../../models/AppSetting');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const validId = (v) => mongoose.isValidObjectId(v);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newToken = () => crypto.randomBytes(18).toString('hex'); // 36 characters
const TOKEN_RE = /^[0-9a-f]{36}$/;
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (name, fn) => async (req, res) => { try { await fn(req, res); } catch (e) { if (e.status) return res.status(e.status).json({ message: e.message }); console.error(`[sales] ${name}:`, e.message); res.status(500).json({ message: 'Something went wrong' }); } };
const bad = (res, status, message, extra = {}) => res.status(status).json({ message, ...extra });
const hashIp = (req) => sha(`${req.ip || ''}|${process.env.JWT_SECRET || 'x'}`).slice(0, 24);

// Next number like Q-2026-0007, per prefix and year, taken with compare-and-set so two people never share one.
async function nextNumber(prefix, at = new Date()) {
  const year = at.getFullYear(); const key = `${prefix}:${year}`;
  for (let i = 0; i < 12; i++) {
    let row = await PlatformCounter.findOne({ key });
    if (!row) { try { row = await PlatformCounter.create({ key, n: 0 }); } catch (e) { if (e.code !== 11000) throw e; row = await PlatformCounter.findOne({ key }); } }
    const r = await PlatformCounter.updateOne({ _id: row._id, n: row.n }, { $set: { n: row.n + 1 } });
    if (r.modifiedCount === 1 || r.matchedCount === 1) return `${prefix}-${year}-${String(row.n + 1).padStart(4, '0')}`;
  }
  throw httpError(503, 'Could not take the next number, try again');
}

const SETTINGS_KEY = 'platform-sales';
const DEFAULT_TERMS = 'Prices are in Pakistani rupees. The subscription starts when payment is received and runs for the period shown. Payment is by bank transfer, JazzCash or Easypaisa to the details on the invoice. Refunds are decided case by case within 14 days of payment. Your school keeps ownership of its data and can export it at any time.';
const DEFAULTS = { companyName: 'Aulensia', address: '', email: '', phone: '', bankName: '', accountTitle: '', accountNumber: '', iban: '', jazzcash: '', easypaisa: '', paymentNote: '', quoteValidDays: 14, invoiceDueDays: 7, terms: DEFAULT_TERMS, termsVersion: 1, firstResponseHours: { low: 24, normal: 8, high: 4, urgent: 1 }, resolveHours: { low: 120, normal: 72, high: 24, urgent: 8 } };
async function settings() { const row = await AppSetting.findOne({ key: SETTINGS_KEY }); return { ...DEFAULTS, ...(row && row.value ? row.value : {}) }; }
async function saveSettings(v) { await AppSetting.updateOne({ key: SETTINGS_KEY }, { $set: { value: v } }, { upsert: true }); return v; }

// Working hours for support deadlines: Monday to Friday 09:00 to 18:00 Pakistan time (no daylight saving), the platform's own hours.
const OFFSET_MS = 5 * 3600 * 1000; const OPEN = 9 * 60; const CLOSE = 18 * 60;
function addWorkingHours(from, hours) {
  let t = new Date(from).getTime() + OFFSET_MS; let left = Math.round(hours * 60); // minutes; t is "Pakistan wall time as UTC"
  const toNext = () => { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); let day = d.getTime() + 86400000; const dow = (x) => new Date(x).getUTCDay(); while (dow(day) === 0 || dow(day) === 6) day += 86400000; t = day + OPEN * 60000; };
  for (let guard = 0; guard < 400 && left > 0; guard++) {
    const d = new Date(t); const dow = d.getUTCDay(); const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (dow === 0 || dow === 6 || mins >= CLOSE) { toNext(); continue; }
    if (mins < OPEN) { t += (OPEN - mins) * 60000; continue; }
    const room = CLOSE - mins; const use = Math.min(room, left); t += use * 60000; left -= use; if (left > 0) toNext();
  }
  return new Date(t - OFFSET_MS);
}
const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
const clean = (s, max = 200) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanBlock = (s, max = 1000) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '').trim().slice(0, max);
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const PHONE = /^[+\d][\d\s\-()]{6,24}$/;
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);

module.exports = { oid, validId, sha, newToken, TOKEN_RE, httpError, wrap, bad, hashIp, nextNumber, settings, saveSettings, DEFAULTS, DEFAULT_TERMS, addWorkingHours, money, clean, cleanBlock, EMAIL, PHONE, addDays };
