# Seeded bugs — answer key

Not linked from the UI. Each bug is tagged with a comment in the source at the
point it's introduced (search for the id below, e.g. `auth-01`).

## Authentication

- **auth-01** — Signup: the client computes `passwordsMatch` but never uses it
  to block submission, and the server never compares `password` to
  `confirmPassword` either. A mismatched confirmation is silently accepted.
  (`public/signup.html`, `routes/auth.js`)
- **auth-02** — Login: invalid credentials return HTTP 200 with `{error}`
  instead of a 4xx status. The client only checks `res.ok`, so a wrong
  password produces no visible feedback — the form just sits there.
  (`routes/auth.js`, `public/login.html`)
- **auth-03** — Logout: the button fires the logout request and clears the
  navbar email, but never redirects or reloads. The rest of the dashboard
  (members, invites, stats, buttons) stays fully visible and clickable even
  though the session is already destroyed server-side.
  (`public/dashboard.html`)
- **auth-04** — Signup/login email validation regex doesn't allow `+` in the
  local part, so valid addresses like `user+test@example.com` are rejected.
  (`routes/auth.js`)

## Team / org invites

- **org-01** — Inviting the same email twice creates two separate pending
  invite rows; there's no uniqueness check before insert.
  (`routes/org.js`)
- **org-02** — Role/org membership is cached in the session at login time and
  never re-validated per request. If an admin removes a member, that member's
  existing session keeps full dashboard access (with their old role) until
  they log out and log back in.
  (`routes/org.js` — `requireOrgAuth`)
- **org-03** — Accepting an invite doesn't check `invite.status` first, so
  resubmitting an already-accepted (or even cancelled) invite link creates
  another duplicate membership row for the same user in the same org.
  (`routes/org.js` — `POST /api/org/accept`)
- **org-04** — The per-row role `<select>` handler should send that row's own
  membership id, but instead reads a shared `currentMemberId` variable that
  gets overwritten on every iteration of the members loop. By the time any
  dropdown is actually changed, it always points at the last member rendered
  — so changing role on member A silently updates member Z instead.
  (`public/dashboard.html`)
- **org-05** — "Cancel invite" removes the table row from the DOM immediately
  and fires the cancel request without awaiting or checking the response, and
  the invite list is never re-fetched. If the request fails, the invite is
  still pending server-side but disappears from the UI until a full reload.
  (`public/dashboard.html`)

## Dashboard

- **dash-01** — "Total Members" stat excludes the `owner` role from its count
  query, so it always reads one lower than what the members table below it
  actually lists.
  (`routes/org.js` — `GET /api/org/stats`)
- **dash-02** — Saving the org name doesn't `trim()` the input, so a name
  saved with trailing/leading spaces (e.g. `"Acme  "`) is stored and
  displayed with the extra whitespace intact.
  (`routes/org.js` — `PUT /api/org`)
- **dash-03** — The org-settings "Saved" toast fires unconditionally instead
  of checking `res.ok`, so a failed save (blank name, expired session, etc.)
  still tells the user it worked.
  (`public/dashboard.html`)
- **dash-04** — Sending a new invite refreshes the invites table but never
  calls `loadStats()`, so the "Pending Invites" stat card only updates after
  a full page reload.
  (`public/dashboard.html`)

## Forgot / reset password

- **forgot-01** — `POST /api/forgot-password` returns 404 "No account found
  with that email" for an unknown address but a generic success message for a
  known one, letting anyone probe which emails are registered instead of
  always answering the same way.
  (`routes/auth.js`)
- **forgot-02** — `expires_at` is stored on each reset token but never checked
  when a reset is submitted, so an old reset link keeps working forever.
  (`routes/auth.js` — `POST /api/reset-password`)
- **forgot-03** — `used` is stored and set to 1 after a successful reset, but
  never checked on the way in, so the same reset link can be submitted
  repeatedly and keeps resetting the password each time.
  (`routes/auth.js` — `POST /api/reset-password`)
- **forgot-04** — `confirmPassword` is accepted from the client but never
  compared against `password`, so a mismatched confirmation on the reset form
  is silently accepted (same gap as signup's auth-01).
  (`routes/auth.js`, `public/reset-password.html`)

## Account / profile settings

- **profile-01** — `POST /api/account/change-password` accepts
  `currentPassword` from the client but never verifies it against the
  account's real password (or checks the new/confirm match), so anyone with
  an authenticated session can change the password without proving they know
  the current one.
  (`routes/account.js`)
- **profile-02** — `PUT /api/account/profile` has no non-empty check on
  `name`, so saving a blank display name is accepted and stored.
  (`routes/account.js`)
- **profile-03** — Saving the profile form shows a "Profile saved" toast but
  never refreshes the navbar, so a changed display name only appears after a
  manual page reload.
  (`public/account.html`)
