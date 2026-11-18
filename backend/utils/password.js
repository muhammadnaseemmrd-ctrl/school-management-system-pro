const bcrypt = require('bcryptjs');

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

const validatePasswordStrength = (password) => {
  if (!password) return false;
  const minLength = password.length >= 6;
  const hasCapital = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);
  return minLength && hasCapital && hasNumber && hasSpecial;
};

const crypto = require('crypto');
// Random temporary password that always satisfies validatePasswordStrength
const strongTempPassword = () => `${crypto.randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, 'x')}A9!`;

module.exports = {
  strongTempPassword,
  hashPassword,
  comparePassword,
  validatePasswordStrength,
};
