const mongoose = require('../lib/pgdoc');

// The head of a group of schools — the person who runs, say, a trust with eleven campuses under
// one name. A director belongs to an organization, never to a school, and may open schools under
// that organization and appoint the people who run each one.
//
// A director never reads a school's own records: no child, no mark, no fee. They see the shape of
// the group — how many schools, how many children, who runs each — and they act on the schools
// themselves. Reading inside a school still means being given an account in that school.
const schema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, unique: true, trim: true },
    phone: { type: String, default: '', trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['director'], default: 'director' },
    title: { type: String, default: 'Director', trim: true },
    // What this director may do. A group may want a second person who can look but not open schools.
    canCreateSchools: { type: Boolean, default: true },
    canAppointAdmins: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    passwordChangedAt: Date,
    createdByName: { type: String, default: '' },
    refreshTokens: [{ token: String, createdAt: { type: Date, default: Date.now, expires: 2592000 } }],
  },
  { timestamps: true }
);

schema.index({ organizationId: 1, isActive: 1 });
schema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('Director', schema);
