// Every time information leaves the school through a connector, one line says who got it, what kind of information and how many records (PRD E30 outbound disclosure log).
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  connectorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  connectorName: { type: String, default: '' },
  kind: { type: String, default: '' },
  channel: { type: String, required: true },                          // oneroster | open_api | webhook | lti | sso
  what: { type: String, default: '' },                                // e.g. "students"
  categories: { type: [String], default: [] },                        // e.g. identity, class membership, contact
  records: { type: Number, default: 0 },
  at: { type: Date, default: Date.now },
}, { timestamps: false });

schema.index({ schoolId: 1, at: -1 });
schema.index({ connectorId: 1, at: -1 });

module.exports = mongoose.model('DisclosureLog', schema);
