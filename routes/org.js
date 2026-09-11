const crypto = require('crypto');
const express = require('express');
const { db, createUser, verifyPassword } = require('../db');

const router = express.Router();

// BUG (org-02): this middleware trusts req.session.orgId / req.session.role,
// which were captured once at login time, instead of re-reading the
// membership row from the DB on every request. If an admin removes a
// member's membership, that member's existing session keeps working (and
// keeps the old role) until they log out and log back in.
function requireOrgAuth(req, res, next) {
  if (!req.session.userId || !req.session.orgId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.orgId = req.session.orgId;
  req.userId = req.session.userId;
  req.role = req.session.role;
  next();
}

function requireAdmin(req, res, next) {
  if (req.role !== 'owner' && req.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
}

router.get('/members', requireOrgAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT memberships.id, memberships.role, users.id AS user_id, users.email
       FROM memberships JOIN users ON users.id = memberships.user_id
       WHERE memberships.org_id = ?
       ORDER BY memberships.id ASC`
    )
    .all(req.orgId);
  res.json({ members: rows });
});

router.get('/invites', requireOrgAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, email, status, created_at FROM invites
       WHERE org_id = ? AND status = 'pending'
       ORDER BY id DESC`
    )
    .all(req.orgId);
  res.json({ invites: rows });
});

router.post('/invite', requireOrgAuth, requireAdmin, (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // BUG (org-01): no check for an existing pending invite to this email, so
  // inviting the same address twice creates two pending invite rows.
  const token = crypto.randomBytes(20).toString('hex');
  db.prepare(
    'INSERT INTO invites (org_id, email, token, invited_by) VALUES (?, ?, ?, ?)'
  ).run(req.orgId, email, token, req.userId);

  res.json({ ok: true, token });
});

router.post('/invite/:id/cancel', requireOrgAuth, requireAdmin, (req, res) => {
  db.prepare(
    "UPDATE invites SET status = 'cancelled' WHERE id = ? AND org_id = ?"
  ).run(req.params.id, req.orgId);
  res.json({ ok: true });
});

// Public: accept an invite by token. Not gated behind requireOrgAuth because
// the person accepting isn't a member yet.
router.post('/accept', (req, res) => {
  const { token, password } = req.body || {};
  const invite = db.prepare('SELECT * FROM invites WHERE token = ?').get(token);
  if (!invite) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  // BUG (org-03): status is never checked here, so re-submitting an
  // already-accepted (or cancelled) invite link still goes through and adds
  // another duplicate membership row for the same user/org.
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(invite.email);
  let userId;
  if (user) {
    if (!password || !verifyPassword(user, password)) {
      return res.status(400).json({ error: 'Incorrect password for existing account' });
    }
    userId = user.id;
  } else {
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    userId = createUser(invite.email, password);
  }

  db.prepare('INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, ?)').run(
    invite.org_id,
    userId,
    'member'
  );
  db.prepare("UPDATE invites SET status = 'accepted' WHERE id = ?").run(invite.id);

  req.session.userId = userId;
  req.session.orgId = invite.org_id;
  req.session.role = 'member';

  res.json({ ok: true });
});

router.post('/member/:id/role', requireOrgAuth, requireAdmin, (req, res) => {
  const { role } = req.body || {};
  if (!['member', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  db.prepare(
    'UPDATE memberships SET role = ? WHERE id = ? AND org_id = ?'
  ).run(role, req.params.id, req.orgId);
  res.json({ ok: true });
});

router.post('/member/:id/remove', requireOrgAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM memberships WHERE id = ? AND org_id = ?').run(
    req.params.id,
    req.orgId
  );
  res.json({ ok: true });
});

router.put('/', requireOrgAuth, requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Org name is required' });
  }
  // BUG (dash-02): name is stored exactly as submitted, with no trim() of
  // leading/trailing whitespace, so "Acme  " saves with trailing spaces.
  db.prepare('UPDATE orgs SET name = ? WHERE id = ?').run(name, req.orgId);
  res.json({ ok: true });
});

router.get('/stats', requireOrgAuth, (req, res) => {
  const org = db.prepare('SELECT * FROM orgs WHERE id = ?').get(req.orgId);
  // BUG (dash-01): excludes the 'owner' row, so "Total Members" undercounts
  // by one relative to what the members table actually lists.
  const memberCount = db
    .prepare("SELECT COUNT(*) AS c FROM memberships WHERE org_id = ? AND role != 'owner'")
    .get(req.orgId).c;
  const pendingInvites = db
    .prepare("SELECT COUNT(*) AS c FROM invites WHERE org_id = ? AND status = 'pending'")
    .get(req.orgId).c;
  res.json({ orgName: org.name, memberCount, pendingInvites });
});

module.exports = router;
