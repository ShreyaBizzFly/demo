const express = require('express');
const { db, verifyPassword, setPassword } = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

router.put('/profile', requireAuth, (req, res) => {
  const { name } = req.body || {};
  // BUG (profile-02): no non-empty check, so saving a blank name is
  // accepted and the account's display name becomes blank everywhere.
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.session.userId);
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

  // BUG (profile-01): currentPassword is accepted from the client but never
  // verified against the account's real password, so anyone with an
  // authenticated session can change the password without proving they know
  // the current one.
  void currentPassword;
  void verifyPassword;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  // (same profile-01 gap) confirmPassword is likewise accepted but unchecked.
  void confirmPassword;

  setPassword(user.id, newPassword);
  res.json({ ok: true });
});

module.exports = router;
