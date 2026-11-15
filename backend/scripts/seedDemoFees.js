// Demo fee data for the DEMO01 school: tuition plans, a few paid installments,
// transport routes, uniform fee and one payment screenshot waiting for review.
// Safe to run repeatedly (does nothing if fee plans already exist).
const crypto = require('crypto');
const zlib = require('zlib');
const FeeStructure = require('../models/FeeStructure');
const StudentFee = require('../models/StudentFee');
const FeeCharge = require('../models/FeeCharge');
const PaymentProof = require('../models/PaymentProof');
const TransportRoute = require('../models/TransportRoute');
const TransportAssignment = require('../models/TransportAssignment');
const StoredFile = require('../models/StoredFile');
const Student = require('../models/Student');
const Class = require('../models/Class');

// tiny PNG "payment slip" so the review screen has something to show (no image libs needed)
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const makeSlipPng = () => {
  const w = 360, h = 220;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      let rgb = [255, 250, 243];                                  // paper
      if (y < 44) rgb = [122, 78, 45];                            // header bar
      else if (y > 70 && y < 78 && x > 24 && x < 200) rgb = [217, 197, 176];
      else if (y > 96 && y < 104 && x > 24 && x < 300) rgb = [217, 197, 176];
      else if (y > 122 && y < 130 && x > 24 && x < 260) rgb = [217, 197, 176];
      else if (y > 160 && y < 196 && x > 24 && x < 170) rgb = [16, 185, 129]; // "sent" badge
      row[1 + x * 3] = rgb[0]; row[2 + x * 3] = rgb[1]; row[3 + x * 3] = rgb[2];
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
};

module.exports = async function seedDemoFees(schoolId, adminId) {
  // Already seeded with the new fee center data?
  if (await TransportRoute.exists({ schoolId })) return false;
  // Demo school only: clear older tuition test data so the demo starts clean
  await Promise.all([FeeStructure.deleteMany({ schoolId }), StudentFee.deleteMany({ schoolId })]);

  const classes = await Class.find({ schoolId });
  const students = await Student.find({ schoolId }).sort({ rollNumber: 1 });
  const stdOf = new Map(classes.map((c) => [String(c._id), c.standard]));

  // Tuition plans (PKR)
  const plans = { 8: 60000, 9: 72000 };
  for (const [standard, total] of Object.entries(plans)) {
    const q = total / 4;
    await FeeStructure.create({ schoolId, standard, totalAmount: total, totalMonths: 12, totalInstallments: 4, academicYear: '2026-2027', q1Amount: q, q2Amount: q, q3Amount: q, q4Amount: q });
  }
  // Installment 1 paid for most students, installment 2 paid for a few
  let i = 0;
  for (const s of students) {
    if (!plans[stdOf.get(String(s.classId))]) continue;
    const paid = i % 5 === 3 ? [] : i % 3 === 0 ? [1, 2] : [1];
    const doc = { schoolId, studentId: s._id, classId: s.classId, paidInstallments: paid, paidDates: {} };
    paid.forEach((n) => { doc[`q${n}Status`] = 'Paid'; doc[`q${n}PaidDate`] = new Date(); doc.paidDates[String(n)] = new Date(); });
    await StudentFee.create(doc);
    i++;
  }

  // Transport
  const r1 = await TransportRoute.create({ schoolId, name: 'Route 1 - Sector G-10', monthlyFee: 3500, vehicle: 'Hiace ICT-1234', driverName: 'Mr. Akram', driverPhone: '0300-1234567' });
  const r2 = await TransportRoute.create({ schoolId, name: 'Route 2 - Bahria Town', monthlyFee: 5000, vehicle: 'Coaster ICT-5678', driverName: 'Mr. Shafiq', driverPhone: '0301-7654321' });
  const onTransport = students.slice(0, 4);
  const month = new Date().toISOString().slice(0, 7);
  for (const [idx, s] of onTransport.entries()) {
    const route = idx % 2 === 0 ? r1 : r2;
    await TransportAssignment.create({ schoolId, studentId: s._id, routeId: route._id, pickupPoint: idx % 2 === 0 ? 'G-10 Markaz' : 'Phase 4 Gate' });
    await FeeCharge.create({
      schoolId, studentId: s._id, classId: s.classId, type: 'Transport', title: `Transport fee - ${month} (${route.name})`,
      amount: route.monthlyFee, dueDate: new Date(`${month}-10T00:00:00Z`), period: month, createdBy: adminId,
    });
  }

  // Uniform fee for everyone in class 8
  const std8 = classes.find((c) => c.standard === '8');
  const uniformCharges = [];
  for (const s of students.filter((x) => String(x.classId) === String(std8?._id))) {
    uniformCharges.push(await FeeCharge.create({ schoolId, studentId: s._id, classId: s.classId, type: 'Uniform', title: 'Winter uniform set', amount: 6500, dueDate: new Date(Date.now() + 14 * 864e5), createdBy: adminId }));
  }

  // One payment screenshot waiting for the admin: Ayesha pays her uniform
  const ayesha = students.find((s) => s.name === 'Ayesha Khan');
  const uni = uniformCharges.find((c) => ayesha && String(c.studentId) === String(ayesha._id));
  if (ayesha && uni) {
    const key = crypto.randomBytes(16).toString('hex');
    const file = await StoredFile.create({ schoolId, key, originalName: 'payment-slip.png', mimeType: 'image/png', data: makeSlipPng(), size: 0 });
    await PaymentProof.create({
      schoolId, studentId: ayesha._id, submittedByRole: 'parent', items: [{ kind: 'charge', chargeId: uni._id, label: uni.title, amount: uni.amount }],
      totalAmount: uni.amount, method: 'JazzCash', reference: 'JC-84739201', screenshotUrl: `/api/files/stored/${file._id}/${key}`, note: 'Paid via JazzCash today',
    });
  }
  return true;
};
