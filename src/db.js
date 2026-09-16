const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'slipsmart.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    firebase_uid  TEXT UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    ai_credits    INTEGER NOT NULL DEFAULT 0,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid        TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS slips (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    league       TEXT NOT NULL DEFAULT '',
    odds_summary TEXT NOT NULL DEFAULT '',
    price_ghs    REAL NOT NULL DEFAULT 0,
    description  TEXT NOT NULL DEFAULT '',
    content      TEXT NOT NULL DEFAULT '',
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slip_id    INTEGER REFERENCES slips(id) ON DELETE SET NULL,
    pack_id    TEXT,
    credits    INTEGER NOT NULL DEFAULT 0,
    reference  TEXT NOT NULL UNIQUE,
    amount     INTEGER NOT NULL DEFAULT 0,
    currency   TEXT NOT NULL DEFAULT 'GHS',
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    paid_at    INTEGER,
    receipt_sent_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS ai_generations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
`);

try { db.exec('ALTER TABLE users ADD COLUMN firebase_uid TEXT'); } catch (err) {
  if (!String(err.message).includes('duplicate column name')) throw err;
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_idx ON users (firebase_uid) WHERE firebase_uid IS NOT NULL');
try { db.exec('ALTER TABLE purchases ADD COLUMN receipt_sent_at INTEGER'); } catch (err) {
  if (!String(err.message).includes('duplicate column name')) throw err;
}

module.exports = db;
