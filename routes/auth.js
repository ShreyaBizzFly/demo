const crypto = require('crypto');
const express = require('express');
const { db, createUser, verifyPassword, setPassword } = require('../db');
const { sendResetEmail } = require('../mailer');

const router = express.Router();

// BUG (auth-04): this regex doesn't allow "+" in the local part, so valid
// plus-addressed emails like "user+test@example.com" are rejected.
const EMAIL_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

router.post('/signup', (req, res) => {
  const { email, password, confirmPassword, orgName, name } = req.body || {};

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  // BUG (auth-01): confirmPassword is accepted from the client but never
  // compared against password here, so a mismatched confirmation is silently
  // accepted (mirrors the client-side gap in public/app.js).
  void confirmPassword;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  const userId = createUser(email, password, name);
  const orgId = db
    .prepare('INSERT INTO orgs (name, owner_id) VALUES (?, ?)')
    .run(orgName || `${email.split('@')[0]}'s Org`, userId).lastInsertRowid;
  db.prepare('INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, ?)').run(
    orgId,
    userId,
    'owner'
  );

  req.session.userId = userId;
  req.session.orgId = orgId;
  req.session.role = 'owner';

  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // BUG (auth-02): invalid credentials return HTTP 200 with an error payload
  // instead of a 4xx status. The client only checks `res.ok`, so a failed
  // login shows no feedback at all.
  if (!user || !verifyPassword(user, password || '')) {
    return res.status(200).json({ error: 'Invalid email or password' });
  }

  const membership = db
    .prepare('SELECT * FROM memberships WHERE user_id = ? LIMIT 1')
    .get(user.id);

  req.session.userId = user.id;
  req.session.orgId = membership ? membership.org_id : null;
  req.session.role = membership ? membership.role : null;

  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const user = db
    .prepare('SELECT id, email, name FROM users WHERE id = ?')
    .get(req.session.userId);
  const org = req.session.orgId
    ? db.prepare('SELECT id, name FROM orgs WHERE id = ?').get(req.session.orgId)
    : null;
  res.json({ user, org, role: req.session.role });
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email || '');

  // BUG (forgot-01): the response reveals whether an account exists for this
  // email instead of always returning the same generic message, letting
  // anyone probe which emails are registered.
  if (!user) {
    return res.status(404).json({ error: 'No account found with that email' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)'
  ).run(user.id, token, expiresAt);

  const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;

  try {
    await sendResetEmail(email, resetUrl);
  } catch (err) {
    console.error('[demo] failed to send reset email:', err.message);
    return res.status(500).json({ error: 'Could not send reset email. Try again later.' });
  }

  res.json({ ok: true, message: 'If that account exists, a reset link has been sent.' });
});

router.post('/reset-password', (req, res) => {
  const { token, password, confirmPassword } = req.body || {};
  const reset = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token || '');

  if (!reset) {
    return res.status(400).json({ error: 'This reset link is invalid.' });
  }
  // BUG (forgot-02): expires_at is stored but never checked here, so an old
  // reset link keeps working indefinitely.
  void reset.expires_at;
  // BUG (forgot-03): `used` is stored and set below, but never checked on
  // the way in — a link already used once still resets the password again.
  void reset.used;

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  // BUG (forgot-04): confirmPassword is accepted from the client but never
  // compared against password here (same gap as signup).
  void confirmPassword;

  setPassword(reset.user_id, password);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

  res.json({ ok: true });
});

module.exports = router;
