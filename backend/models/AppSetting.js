const mongoose = require('../lib/pgdoc');
// Tiny key/value store for platform-wide settings (e.g. generated web-push keys)
module.exports = mongoose.model('AppSetting', new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed }, { timestamps: true }));
