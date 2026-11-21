// Short-lived, single-use records for sign-in and launch flows: a launch waiting for the tool, a sign-in waiting for the provider, a sign-in code waiting to be exchanged.
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['lti_launch', 'sso_login', 'sso_code'], required: true },
  key: { type: String, required: true },                              // the opaque value handed out (login hint, state or code)
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: false });

schema.index({ kind: 1, key: 1 }, { unique: true });
schema.index({ expiresAt: 1 });

module.exports = mongoose.model('IntState', schema);
