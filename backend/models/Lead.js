const mongoose = require('../lib/pgdoc');
// Someone who asked Aulensia for a demo, a quote or an answer (PRD E28). Collected with their consent, kept only to follow up.
const history = new mongoose.Schema({ at: { type: Date, default: Date.now }, by: { type: String, default: '' }, action: { type: String, default: '' }, note: { type: String, default: '' } }, { _id: false });
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
  phone: { type: String, default: '', trim: true, maxlength: 30 },
  phoneKey: { type: String, default: '' }, // last 10 digits, so 0300-1234567 and +92 300 1234567 match
  schoolName: { type: String, required: true, trim: true, maxlength: 160 },
  city: { type: String, default: '', trim: true, maxlength: 80 },
  role: { type: String, default: '', trim: true, maxlength: 60 },
  students: { type: Number, default: 0, min: 0, max: 100000 },
  interest: { type: String, enum: ['demo', 'quote', 'question'], default: 'demo' },
  message: { type: String, default: '', maxlength: 1000 },
  preferredTime: { type: String, default: '', maxlength: 80 },
  source: { type: String, default: 'website', maxlength: 60 },
  utmSource: { type: String, default: '', maxlength: 60 }, utmMedium: { type: String, default: '', maxlength: 60 }, utmCampaign: { type: String, default: '', maxlength: 80 },
  refCode: { type: String, default: '', maxlength: 20 },
  agentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ['New', 'Contacted', 'DemoBooked', 'Quoted', 'Won', 'Lost', 'Spam'], default: 'New' },
  lostReason: { type: String, default: '' },
  ownerNote: { type: String, default: '', maxlength: 2000 },
  demoAt: { type: Date, default: null }, demoNotes: { type: String, default: '', maxlength: 1000 },
  firstContactedAt: { type: Date, default: null }, lastContactedAt: { type: Date, default: null },
  convertedSchoolId: { type: mongoose.Schema.Types.ObjectId, default: null },
  consentAt: { type: Date, default: Date.now }, consentText: { type: String, default: '' },
  duplicateOf: { type: mongoose.Schema.Types.ObjectId, default: null },
  requests: { type: Number, default: 1 }, // the same person asking again
  ipHash: { type: String, default: '' },
  history: { type: [history], default: [] },
}, { timestamps: true });
schema.index({ status: 1, createdAt: -1 });
schema.index({ email: 1 });
schema.index({ phoneKey: 1 });
schema.index({ agentId: 1, status: 1 });
schema.index({ convertedSchoolId: 1 });
schema.index({ ipHash: 1, createdAt: -1 });
module.exports = mongoose.model('Lead', schema);
