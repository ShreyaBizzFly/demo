const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createUser(email, password, name) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const stmt = db.prepare(
    'INSERT INTO users (email, name, password_hash, password_salt) VALUES (?, ?, ?, ?)'
  );
  const info = stmt.run(email, name || null, hash, salt);
  return info.lastInsertRowid;
}

function verifyPassword(user, password) {
  const hash = hashPassword(password, user.password_salt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.password_hash));
}

function setPassword(userId, newPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(newPassword, salt);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(
    hash,
    salt,
    userId
  );
}

// Seed a demo account/org on first run so the app has something to look at.
const seedCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (seedCount === 0) {
  const ownerId = createUser('owner@demo.com', 'password123', 'Demo Owner');
  const orgId = db
    .prepare('INSERT INTO orgs (name, owner_id) VALUES (?, ?)')
    .run('Acme Inc', ownerId).lastInsertRowid;
  db.prepare(
    'INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, ?)'
  ).run(orgId, ownerId, 'owner');
  console.log('Seeded demo account: owner@demo.com / password123 (org: Acme Inc)');
}

module.exports = { db, createUser, verifyPassword, setPassword };
