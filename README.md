# demo-buggy-app

Small SaaS-shaped demo app for bug-capture testing. Five workflows:
authentication, team/org invites, a dashboard (org settings, members, stats),
forgot/reset password, and account/profile settings. It has intentionally
seeded bugs — see `BUGS.md` for the answer key (not linked from the UI).

## Run it

```
npm install
npm start
```

Then open http://localhost:4100 — it redirects to the login page.

Seeded demo account: `owner@demo.com` / `password123` (org: "Acme Inc").
