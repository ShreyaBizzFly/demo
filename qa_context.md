# Demo SaaS — QA Context

Business/domain knowledge for automated test generation. This file describes
the **intended** correct behavior of the app — the source code may not always
match it. Use this as the ground truth when generating and grading tests, not
the current implementation.

---

## 1. Project & Domain

A minimal SaaS app with five workflows: account authentication, team/org
invites, an org dashboard (settings, members, stats), forgot/reset password,
and account/profile settings (display name, change own password). One
deployable: Node/Express + SQLite, server-rendered static pages with vanilla
JS calling a JSON API under `/api`.

Vocabulary: an **org** (organization/workspace) is a tenant. A **member** is a
user with a role inside one org. An **invite** is a pending, single-use,
token-based offer to join an org as a member.

```yaml
industry: generic SaaS demo (multi-tenant)
locale: en-US
```

---

## 2. Entities

```yaml
entities:
  - name: User
    description: A person with a login. Has exactly one password (hashed + salted) and an optional display name.
    key_fields: [email, name, password_hash, password_salt]
  - name: Org
    description: A tenant workspace, owned by the user who created it.
    key_fields: [name, owner_id]
  - name: Membership
    description: Links a User to an Org with a role.
    key_fields: [org_id, user_id, role]
  - name: Invite
    description: A pending offer for an email address to join an org, redeemed via a single-use token.
    key_fields: [org_id, email, token, status, invited_by]
  - name: PasswordReset
    description: A single-use, time-limited token issued to reset one user's password.
    key_fields: [user_id, token, expires_at, used]
```

---

## 3. Domain Vocabulary & Test Data

```yaml
vocabulary:
  org_name: ["Acme Inc", "Globex Corp", "Initech", "Umbrella Labs"]
  person_email: [alice@demo.com, bob@demo.com, carol@demo.com, "dev+test@demo.com"]
  person_name: [Alice Johnson, Bob Martinez, Carol Nguyen]
  role: [owner, admin, member]
```

Seeded account for testing: `owner@demo.com` / `password123`, org "Acme Inc".

Email addresses used in tests should include at least one plus-addressed
example (e.g. `qa+signup1@demo.com`) — plus-addressing is valid per RFC 5321
and a real signup form must accept it.

---

## 4. Enums

```yaml
enums:
  role:
    - {value: owner, label: "Owner"}
    - {value: admin, label: "Admin"}
    - {value: member, label: "Member"}
  invite_status: [pending, accepted, cancelled]
```

---

## 5. Business Rules

### Authentication

- Signup requires a valid email, a password of at least 8 characters, and a
  matching password confirmation. A mismatched confirmation must be rejected
  before an account is created.
- An email address may hold only one account; a second signup attempt with
  the same email is refused.
- Email validation must accept RFC-valid addresses, including plus-addressed
  ones (`user+tag@example.com`).
- Login with an unknown email or a wrong password must be clearly rejected —
  the UI must show a visible, specific error, not a silent no-op.
- Logging out must end the session immediately and return the user to a
  logged-out state (redirect to login, or the current page's authenticated
  content becoming inaccessible) without requiring a manual page refresh.

### Team / org invites

- Inviting the same email to the same org while a pending invite already
  exists for that email must not create a second pending invite — either the
  duplicate is rejected or it resends/refreshes the existing one.
- Only an org's owner or admin may send, cancel, or accept-manage invites, or
  change another member's role.
- Accepting an invite is a one-time action: submitting the same invite token
  a second time (e.g. a reused link) must not create a second membership for
  that user in that org.
- Cancelling a pending invite must be reflected consistently: the invite list
  shown to the user must match what the server actually has after the action
  completes, with no invite reappearing or disappearing incorrectly.
- Changing a member's role must apply to the specific member whose row was
  edited, never to a different member.
- Removing a member from an org must revoke their access to that org's data
  promptly — a removed member must not be able to continue acting as a member
  after removal.

### Forgot / reset password

- Requesting a reset link must answer the same way regardless of whether the
  email belongs to an account, so a visitor cannot use this form to discover
  which emails are registered.
- A reset link is single-use: once it has been used to set a new password,
  submitting the same link again must be rejected, not silently accepted.
- A reset link must expire after a bounded time; submitting an expired link
  must be rejected, not silently accepted.
- The reset form's password and confirm-password fields must match before the
  password is changed.
- After a successful reset, the new password must work for login and the old
  password must no longer work.

### Account / profile settings

- Changing the account's own password must require correctly entering the
  current password first — an authenticated session alone must not be enough
  to set a new password.
- The new password and its confirmation must match before the password is
  changed.
- Saving the display name must reject a blank name; the display name shown
  elsewhere in the app (navbar, dashboard) must never go blank because of a
  profile save.
- After saving the profile, the updated display name must be reflected
  wherever it is shown (e.g. the navbar) without requiring a manual page
  reload.

### Dashboard

- The "Total Members" count shown on the dashboard must match the number of
  rows in the members table below it (every member counts, including the
  owner).
- Saving org settings must only report success to the user when the save
  actually succeeded server-side.
- An org name is stored and displayed without leading/trailing whitespace.
- Dashboard stat cards (member count, pending invite count) must reflect the
  current state after actions taken on the same page (inviting, cancelling,
  adding/removing a member) without requiring a manual page reload.

---

## 6. Constraints & Limits

| Limit | Value |
|---|---|
| Password length | ≥ 8 characters |
| Org name | required, non-empty after trimming |
| Display name | required, non-empty |
| Session lifetime | 8 hours |
| Password reset token validity | 1 hour, single-use |

---

## 7. Permissions & Roles

Three roles per org: `owner`, `admin`, `member`.

- `owner` — created the org at signup. Full access, cannot be removed or have
  their role changed.
- `admin` — can invite/cancel invites, change member roles (member ⇄ admin),
  remove members, and edit org settings.
- `member` — can view the dashboard, members list, and their own org, but
  cannot invite, remove, or change anyone's role, or edit org settings.

A logged-out visitor can reach `/login.html`, `/signup.html`,
`/forgot-password.html`, `/reset-password.html?token=...`, and
`/accept-invite.html?token=...` only. Every `/api/org/*` route other than
`POST /api/org/accept` requires an active session, and every `/api/account/*`
route requires an active session. `/api/forgot-password` and
`/api/reset-password` are the only public (unauthenticated) routes outside
signup/login/accept-invite.

---

## 8. Journeys & Workflows

```yaml
journeys:
  - name: Sign up and create an org
    steps:
      - Open /signup.html
      - Fill Company/workspace name
      - Fill Work email
      - Fill Password and Confirm password (matching)
      - Click "Create account"
    success_signal: redirected to /dashboard.html, logged in as the new user, owner of the new org

  - name: Sign up with mismatched password confirmation is rejected
    steps:
      - Open /signup.html
      - Fill Company/workspace name and Work email
      - Fill Password
      - Fill Confirm password with a different value
      - Click "Create account"
    success_signal: a visible error, no account created

  - name: Sign up with a plus-addressed email
    steps:
      - Open /signup.html
      - Fill Work email as "qa+signup1@demo.com"
      - Fill matching Password and Confirm password
      - Click "Create account"
    success_signal: account created successfully, no "invalid email" error

  - name: Log in with valid credentials
    steps:
      - Open /login.html
      - Enter Email owner@demo.com
      - Enter Password password123
      - Click "Log in"
    success_signal: redirected to /dashboard.html

  - name: Log in with a wrong password is rejected visibly
    steps:
      - Open /login.html
      - Enter Email owner@demo.com
      - Enter an incorrect Password
      - Click "Log in"
    success_signal: a visible error message on the login page; user stays on /login.html

  - name: Log out
    steps:
      - While logged in on /dashboard.html
      - Click "Log out"
    success_signal: user is returned to a logged-out state without needing a manual refresh (redirected to /login.html, or dashboard content/actions become inaccessible)

  - name: Invite a teammate
    steps:
      - While logged in as owner/admin on /dashboard.html
      - Enter an email under "Invite a teammate"
      - Click "Send invite"
    success_signal: the email appears in the pending invites table; the "Pending Invites" stat updates to match, without a page reload

  - name: Invite the same email twice
    steps:
      - Send an invite to teammate@demo.com
      - Send an invite to teammate@demo.com again while the first is still pending
    success_signal: only one pending invite exists for teammate@demo.com

  - name: Accept an invite
    steps:
      - Open /accept-invite.html?token=<token> for a pending invite
      - Enter a Password
      - Click "Accept invite"
    success_signal: redirected to /dashboard.html as a member of the inviting org; the org's members table shows exactly one new row

  - name: Reuse an already-accepted invite link
    steps:
      - Accept an invite successfully
      - Revisit the same /accept-invite.html?token=<token> URL and submit again
    success_signal: the second submission is rejected; no duplicate membership is created

  - name: Cancel a pending invite
    steps:
      - On /dashboard.html, click "Cancel" next to a pending invite
    success_signal: the invite disappears from the table and stays gone after a page reload; the "Pending Invites" stat decreases

  - name: Change a member's role
    steps:
      - On /dashboard.html members table, change one member's role dropdown from "member" to "admin"
    success_signal: only that member's role changes; reloading the page shows the same member with the new role, and every other member unchanged

  - name: Remove a member
    steps:
      - On /dashboard.html members table, click "Remove" next to a member
    success_signal: the member disappears from the table, "Total Members" decreases by one, and that member's own session can no longer act as an org member

  - name: Edit org settings
    steps:
      - On /dashboard.html, change the Organization name field
      - Click "Save"
    success_signal: a success message is shown only if the save actually succeeded; reloading the page shows the trimmed new name, matching what's displayed elsewhere in the app

  - name: Request a password reset link for an existing account
    steps:
      - Open /forgot-password.html
      - Enter Email owner@demo.com
      - Click "Send reset link"
    success_signal: a generic confirmation message is shown, identical to what a non-existent email would receive

  - name: Reset password with a valid link
    steps:
      - Open /reset-password.html?token=<a freshly issued reset token>
      - Enter New password and Confirm new password (matching)
      - Click "Reset password"
    success_signal: redirected to /login.html; logging in with the new password succeeds and the old password no longer works

  - name: Reset password with mismatched confirmation is rejected
    steps:
      - Open /reset-password.html?token=<a freshly issued reset token>
      - Enter New password
      - Enter a different value in Confirm new password
      - Click "Reset password"
    success_signal: a visible error, password is not changed

  - name: Reuse an already-used reset link
    steps:
      - Complete a password reset successfully with a given token
      - Revisit /reset-password.html with the same token and submit a different new password
    success_signal: the second submission is rejected; the password from the first (successful) reset still works, the second one does not

  - name: Update display name
    steps:
      - While logged in, open /account.html
      - Change the Display name field
      - Click "Save"
    success_signal: the new name is shown in the navbar without a manual reload, and persists after a reload

  - name: Save a blank display name is rejected
    steps:
      - On /account.html, clear the Display name field entirely
      - Click "Save"
    success_signal: a visible error; the previous non-blank name is retained

  - name: Change own password with the correct current password
    steps:
      - On /account.html, enter the correct Current password
      - Enter New password and Confirm new password (matching)
      - Click "Update password"
    success_signal: a success message; logging in with the new password works and the old one no longer does

  - name: Change own password with the wrong current password is rejected
    steps:
      - On /account.html, enter an incorrect Current password
      - Enter New password and Confirm new password (matching)
      - Click "Update password"
    success_signal: a visible error; the password is not changed; logging in with the old password still works
```

---

## 9. Automation Policy

**Everything in this app is safe to automate fully, unattended, with no manual
review and no "never trigger" carve-outs.**

This is a throwaway local sandbox with seeded SQLite data
(`demo-buggy-app/data.sqlite`) — not a production system, not anyone's real
account, and nothing here reaches a real inbox, a real payment processor, a
real third party, or any other tenant's data. Every write is free, reversible
(re-seed by deleting `data.sqlite` and restarting the server), and repeatable.

Explicitly, none of the following restrictions apply, and no case in this
project should be downgraded to manual because of them:

- No email verification step exists anywhere — signup, login, invite
  acceptance, and password reset never send or require a real email/OTP. The
  forgot-password flow prints its reset link to the server console instead of
  sending mail (there is no SMTP integration), so the link is reachable for
  testing without an inbox.
- No payment, billing, or third-party OAuth flow exists.
- No action here is platform-wide or irreversible in a way that harms another
  user — this app has exactly one seeded org's worth of data, and every
  destructive action (remove member, cancel invite, change/reset a password)
  only ever touches this sandbox's own rows.
- Signup, login, logout, invite send/cancel/accept, role change, member
  removal, org settings save, forgot/reset password, and profile/password
  changes are all safe to submit for real and should run automatically,
  including cases that create, edit, or delete data.

Freely crawl, fill in and submit every form (signup, login, invite, accept
invite, org settings, forgot password, reset password, profile, change
password) with real values, and freely click every action button (cancel
invite, remove member, change role, save settings) — none of it requires
human confirmation first.
