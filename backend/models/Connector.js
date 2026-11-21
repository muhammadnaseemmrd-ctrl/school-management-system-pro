// A connection between the school and something outside it (PRD E30): a school-owned API key, a webhook, a learning tool (LTI) or a sign-in provider (SSO).
// What each may see is its scopes. Secrets are never stored in the clear: a key is stored as a hash, other secrets are encrypted.
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  kind: { type: String, enum: ['api_key', 'webhook', 'lti_tool', 'sso'], required: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  purpose: { type: String, default: '', maxlength: 300 },            // why the school shares this data, in words
  status: { type: String, enum: ['draft', 'pending_review', 'active', 'paused', 'revoked'], default: 'draft' },
  scopes: { type: [String], default: [] },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },          // kind-specific, see utils/integrations/catalog.js
  // api_key: only the hash is kept; the key is shown once. A rotated key keeps working for a grace period.
  keyPrefix: { type: String, default: null },
  keyHash: { type: String, default: null },
  previousHash: { type: String, default: null }, previousUntil: { type: Date, default: null }, previousPrefix: { type: String, default: '' }, previousSecretEnc: { type: String, default: null },
  expiresAt: { type: Date, default: null },
  quotaPerHour: { type: Number, default: 1000 },
  usageHour: { type: String, default: '' }, usageCount: { type: Number, default: 0 },
  // webhook, lti_tool and sso: a secret kept encrypted
  secretEnc: { type: String, default: null },
  secretHint: { type: String, default: '' },
  rotatedAt: Date,
  lastUsedAt: Date, lastUsedIp: { type: String, default: '' },
  // a connector that shares anything sensitive is looked at by a second administrator before it goes live
  review: {
    required: { type: Boolean, default: false },
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    why: { type: [String], default: [] },
    askedByName: String, askedById: mongoose.Schema.Types.ObjectId, askedAt: Date,
    decidedByName: String, decidedById: mongoose.Schema.Types.ObjectId, decidedAt: Date, note: { type: String, default: '' }, soleAdmin: { type: Boolean, default: false },
  },
  failures: { type: Number, default: 0 },                              // consecutive failed webhook deliveries
  pausedReason: { type: String, default: '' },
  revokedAt: Date, revokedByName: String, revokedReason: { type: String, default: '' },
  createdById: mongoose.Schema.Types.ObjectId, createdByName: { type: String, default: '' },
  history: { type: [{ at: Date, by: String, what: String, note: String }], default: [] },
}, { timestamps: true });

schema.index({ schoolId: 1, kind: 1, status: 1 });
schema.index({ keyPrefix: 1 }, { unique: true, sparse: true });
schema.index({ previousPrefix: 1 });
schema.index({ schoolId: 1, name: 1 });

module.exports = mongoose.model('Connector', schema);
