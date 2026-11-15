const db = require('../lib/pgdoc');

// Connects to PostgreSQL (DATABASE_URL / POSTGRES_URL, e.g. Neon via Vercel) and creates the tables on first run.
// With no connection string it falls back to a local file database (PGLITE_DIR) for development.
const connectDB = async () => {
  try {
    const conn = await db.connect();
    console.log(`PostgreSQL connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
