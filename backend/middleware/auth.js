const { verifyToken } = require('../utils/jwt');

// ── School status cache (suspended / expired schools are blocked mid-session) ──
const statusCache = new Map(); // schoolId -> { blocked, message, ts }
const TTL = 60 * 1000;

const invalidateSchoolStatus = (schoolId) => {
  if (schoolId) statusCache.delete(String(schoolId));
  else statusCache.clear();
};

const getSchoolBlock = async (schoolId) => {
  const key = String(schoolId);
  const hit = statusCache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit;
  const School = require('../models/School');
  const school = await School.findById(schoolId).select('isActive subscriptionExpiresAt suspendedReason');
  let entry = { blocked: false, message: '', ts: Date.now() };
  if (!school) {
    entry = { blocked: true, message: 'School not found', ts: Date.now() };
  } else if (!school.isActive) {
    entry = { blocked: true, message: school.suspendedReason || 'This school account has been suspended. Please contact support.', ts: Date.now() };
  } else if (school.subscriptionExpiresAt && school.subscriptionExpiresAt < new Date()) {
    entry = { blocked: true, message: 'This school subscription has expired. Please contact the platform owner to renew.', ts: Date.now() };
  }
  statusCache.set(key, entry);
  return entry;
};

// Authenticate Token
const authenticate = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1] || req.query.token;

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }

  req.user = decoded;

  if (decoded.role !== 'superadmin' && decoded.schoolId) {
    try {
      const block = await getSchoolBlock(decoded.schoolId);
      if (block.blocked) {
        return res.status(423).json({ message: block.message, code: 'SCHOOL_BLOCKED' });
      }
    } catch (e) {
      return next(e);
    }
  }
  next();
};

// Authorize by Role
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};

// Verify School Access
const verifySchoolAccess = (req, res, next) => {
  const schoolId = req.params.schoolId || req.body.schoolId;
  if (req.user.schoolId !== schoolId) {
    return res.status(403).json({ message: 'School access denied' });
  }
  next();
};

module.exports = {
  authenticate,
  authorize,
  verifySchoolAccess,
  invalidateSchoolStatus,
};
