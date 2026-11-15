// Demo extras: a live offer, school payment details and a welcome notice. Safe to run repeatedly.
const Offer = require('../models/Offer');
const School = require('../models/School');
const Notice = require('../models/Notice');

module.exports = async function seedDemoExtras(schoolId, adminId) {
  if (!(await Offer.exists({ title: 'Admission season special' }))) {
    await Offer.create({
      title: 'Admission season special', description: '25% off the first 3 months when you move to a paid plan.',
      code: 'ADMIT25', discountType: 'percent', discountValue: 25, planSlugs: [], validUntil: new Date(Date.now() + 60 * 864e5),
    });
  }
  const school = await School.findById(schoolId).select('paymentInfo');
  if (school && !school.paymentInfo?.accountNumber) {
    await School.updateOne({ _id: schoolId }, {
      motto: 'Learning with character', academicYear: '2026-2027',
      paymentInfo: { bankName: 'Demo Bank', accountTitle: 'Demo Public School', accountNumber: '0000-1234567-01', iban: '', jazzcash: '0300-0000000', easypaisa: '0345-0000000', instructions: "Write the student's roll number in the payment note, then upload the screenshot here." },
    });
  }
  if (!(await Notice.exists({ schoolId, title: 'Fees can now be paid by screenshot' }))) {
    await Notice.create({
      schoolId, title: 'Fees can now be paid by screenshot', category: 'General', createdBy: adminId, createdByModel: 'User', targetAudience: 'All',
      content: 'Pay through JazzCash, Easypaisa or bank transfer, then upload the screenshot in the Fees tab. Guide: https://example.com/how-to-pay',
    });
  }
};
