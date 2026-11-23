const mongoose = require('../lib/pgdoc');
// A person who works for the school: teaching staff (linked to their teacher login) or non-teaching staff.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  code: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['teacher', 'admin', 'clerk', 'guard', 'cleaner', 'driver', 'technician', 'librarian', 'counselor', 'visiting', 'vendor'], required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  positionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', default: null },
  campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null },   // which branch they work at; empty means the main one
  department: { type: String, default: '' }, managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  phone: { type: String, default: '' }, email: { type: String, default: '', lowercase: true },
  joinDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['Onboarding', 'Active', 'Separated'], default: 'Onboarding' },
  basicSalary: { type: Number, default: 0, min: 0 },
  allowances: [{ name: String, amount: Number, taxable: { type: Boolean, default: true } }],
  checklist: [{ key: String, label: String, done: { type: Boolean, default: false }, doneAt: Date, doneByName: String }],
  separatedOn: Date, separationReason: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, code: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, name: 1 });
schema.index({ schoolId: 1, teacherId: 1 });
module.exports = mongoose.model('Employee', schema);
