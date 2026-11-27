// A screen that this kind of place does not use is refused at the door, not merely hidden in the
// menu. Otherwise a university's registrar would still answer for a primary school to anybody who
// typed the address, and the menu would be decoration rather than a rule.

const School = require('../models/School');
const IT = require('../utils/institutionTypes');

// A school's kind rarely changes, so it is worth remembering for a minute rather than reading it
// on every request to these parts.
const cache = new Map();
const TTL = 60 * 1000;

const typeOf = async (schoolId) => {
  const key = String(schoolId);
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.type;
  const sc = await School.findById(schoolId).select('institutionType');
  const type = sc?.institutionType || IT.DEFAULT;
  cache.set(key, { type, until: Date.now() + TTL });
  return type;
};

const forget = (schoolId) => cache.delete(String(schoolId));

const needsScreen = (screen) => async (req, res, next) => {
  try {
    if (!req.user?.schoolId) return next();          // the owner console and the group office have no school
    const type = await typeOf(req.user.schoolId);
    if (IT.uses(type, screen)) return next();
    const t = IT.get(type);
    return res.status(403).json({
      message: `A ${t.label.toLowerCase()} does not use this part of Aulensia. Change the kind of institution in School Setup if that is wrong.`,
      code: 'NOT_FOR_THIS_INSTITUTION',
      institutionType: type,
    });
  } catch (e) {
    console.error('institution gate:', e.message);
    return next();        // a gate that cannot read the school should not take the school down
  }
};

module.exports = { needsScreen, typeOf, forget };
