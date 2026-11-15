// Mongoose-compatible facade backed by Postgres. `require('../lib/pgdoc')` can be used wherever `mongoose` was.
const db = require('./db');
const registry = require('./registry');
const ddl = require('./ddl');
const { Schema, ObjectId, ValidationError, CastError, HEX24 } = require('./schema');
const { createModel } = require('./model');
const fs = require('fs');
const path = require('path');

// Register every model file so all tables exist before the first query, whatever order modules load in.
const loadModels = () => {
  const dir = path.join(__dirname, '..', '..', 'models');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) require(path.join(dir, f));
};

const connection = { readyState: 0, host: '', name: 'postgres' };

const api = {
  Schema,
  Types: { ObjectId },
  Error: { ValidationError, CastError },
  connection,
  model(name, schema) {
    if (!schema) { const m = registry.get(name); if (!m) throw new Error(`Model ${name} has not been registered`); return m; }
    return createModel(name, schema);
  },
  get models() { return Object.fromEntries(registry.models); },
  modelNames: () => registry.names(),
  isValidObjectId: (v) => v instanceof ObjectId || (typeof v === 'string' && HEX24.test(v)),
  set() {},
  async connect(uri) {
    loadModels();
    await db.connect(uri);
    await ddl.init();
    connection.readyState = 1;
    connection.host = db.info().host;
    return api;
  },
  async disconnect() { await db.close(); connection.readyState = 0; },
  sweepExpired: ddl.sweepExpired,
  db,
};

module.exports = api;
