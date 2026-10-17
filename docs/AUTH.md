# Sign-in, passwords and API access

Covers the one-time password flow, the CORS allowlist and the login throttle. Written so a
future maintainer can change any of it without rereading all the code.

---

## Roles

Two, on `users.role`:

| Role | Can |
|---|---|
| `super_admin` | everything, including delete, approve, manage users, Settings and P/L |
| `normal_admin` | add records; no deleting, no approving, no Users or Settings tab |

There is no RBAC layer: each route does its own `if (req.user.role !== 'super_admin')` check.
Adding a role means visiting every route that has one.

## One-time passwords

A password a super admin types for someone else is **temporary by definition**. It gets them
through one sign-in and no further until they choose their own.

`users.mustChangePassword` is set when:

- a super admin **creates** a user (`POST /api/users`)
- a super admin **resets** someone else's password (`PATCH /api/users/:id/password`)

It is **not** set when a super admin resets **their own** password — they chose it themselves,
so there is nothing temporary about it. The route compares `req.params.id` against `req.user.id`.

It is cleared by `POST /api/auth/change-password`, and nothing else.

### How it is enforced

```
middleware/auth.js
├── resolve   verify the token, then LOAD THE ACCOUNT from the database and build req.user
│             from it. Exported as `verifyOnly`, used only by POST /api/auth/change-password.
└── auth      resolve, then 403 { code: 'password_change_required' }
              if the account has mustChangePassword set
              └── used by every other route
```

**`req.user` is built from the database on every request, not from the token's claims.** The
token is only proof of who signed in; it is valid for 24 hours and says nothing about what has
happened since. See "Revocation" below for why that matters.

The gate is server-side on purpose. Hiding the rest of the app in the browser would be
decoration — the token would still open the API to anyone calling it directly.

`/api/auth/change-password` returns a fresh `{ token, user }` so the frontend can update what it
shows. The old token from the same sign-in also starts working again at that point, because the
account is simply fine now; it belongs to the same person either way.

### The screen

`frontend/src/components/ChangePassword.jsx`, chosen in `App.jsx`:

```
no user            → Login
mustChangePassword → ChangePassword     (the only way out is a new password, or Sign out)
otherwise          → Layout
```

The current password is required, but the user is not asked to retype what they typed a moment
ago: `AuthContext` keeps the just-typed password **in memory only** (never in `localStorage`)
and `ChangePassword` submits it as `currentPassword`. After a page reload it is gone, and the
screen asks for it. That is why the field is conditional.

Rules the endpoint enforces: both fields present, new password ≥ 6 characters, and **the new
password must differ from the current one** — without that last check a one-time password could
be "changed" to itself and stay in force.

A wrong current password answers **400, not 401**. The axios interceptor in `api/index.js`
treats any 401 as an expired session and signs the user out, which is the wrong response to a
typo.

### What a super admin sees

The Users tab shows an amber **One-time password** badge against anyone still holding a password
they did not choose, and reports the outcome of a reset in a dismissible banner.

## Revocation

Because the account is reloaded on every request, a change to it applies to sessions that are
**already open**, not just at the next sign-in:

| You do this | What happens to their open session |
|---|---|
| **Delete the user** | 401 on the very next request, with *"Your account is no longer active."* They cannot read anything, cannot create anything, and cannot even reach the change-password route. |
| **Reset their password** | 403 `password_change_required` at once. They are stuck on the change screen and cannot get past it without the new password you set, which they do not have unless you tell them. |
| **Change their role** | Applies immediately, both ways — a promotion opens the super-admin routes, a demotion closes them. |

This is what the per-request lookup buys. Before it, a deleted user kept full access — including
creating records — for up to 24 hours, until their token expired.

The frontend completes the loop: `api/index.js` stores the server's message in
`localStorage.signedOutReason` before clearing the session, and `Login.jsx` shows it once, so
someone whose account was deleted sees why they were signed out instead of being bounced to the
login page for no visible reason.

### What revocation still does not cover

- **A password change does not sign out that user's other sessions.** If the same person is
  signed in on two devices and changes their password on one, the other keeps working until its
  token expires. Closing it means a `sessionsValidFrom` timestamp on the user, set on every
  password change, and rejecting tokens whose `iat` predates it. It matters little today because
  there is no self-service password change in the UI, and a super-admin reset *is* an effective
  revocation (the 403 above).
- **Rotating `JWT_SECRET`** remains the blunt instrument: it invalidates every session for
  everyone at once.

### Cost

One `findById` by primary key per authenticated request, `.select()`ed to four fields and
`.lean()`. Measured on the live server: mean round-trip for `GET /api/materials` (58 records)
went from **6.1 ms to 8.9 ms**. A tab like P/L fires five requests on mount, so about 14 ms
added there. Worth it.

A database fault during the lookup answers **503**, not 401 — a 401 would sign every user out
the moment Mongo hiccuped.

### Not in the UI

Self-service password change. The endpoint already supports any signed-in user, so it is a
button away.

## CORS

`server.js` holds an allowlist, overridable with `CORS_ORIGINS` (comma-separated):

```
https://fwr.limecodelabs.com
https://www.fwr.limecodelabs.com
https://fwrbe.limecodelabs.com
http://localhost:4200
```

Worth understanding: **the app makes no cross-origin requests at all.** The browser calls
`/api/...` on whatever host served the page — nginx sends `/` to Vite, Vite proxies `/api` to
the backend — so everyday traffic is same-origin and CORS never comes into it. The allowlist is
there to stop *another* website from spending a stolen token against this API from someone's
browser.

A request with **no `Origin` header** is allowed through: that covers curl, the cron scripts,
health checks and same-origin navigations, and there is nothing to decide. A disallowed origin
gets a normal response **without** the CORS headers rather than an error, so the browser blocks
it (which is the point) and the log stays free of scanner noise.

Credentials are not used: the JWT travels in the `Authorization` header, not a cookie.

## Login throttle

`middleware/rateLimit.js`, applied to `POST /api/auth/login` only.

- **Only failures count**, and a success wipes the caller's record. The whole plant can sit
  behind one public IP, so counting every attempt would let a few mistyped passwords lock out
  everyone. A brute-force run is nothing but failures, so it still hits the wall.
- Anything that is not a 200 or a 401 — a malformed body, a database fault — is not a guess and
  is not counted.
- Defaults: **10 failures per 15 minutes**, via `LOGIN_RATE_MAX_FAILURES` and
  `LOGIN_RATE_WINDOW_MINUTES`. Blocked callers get **429** and a `Retry-After`.
- Off-by-one worth knowing: with a limit of N, the Nth failure is still answered 401 and the
  **N+1th** is the first to be blocked. The check runs before the attempt, on the count so far.
- In-memory, with a sweep every 5 minutes so the map cannot grow without limit. There is one
  backend process, and `routes/backup.js` already tracks download tokens the same way. It resets
  on restart, which costs an attacker their progress too.

`app.set('trust proxy', 1)` in `server.js` is **load-bearing**. nginx sets `X-Forwarded-For`;
without trusting it, `req.ip` is the proxy's own `127.0.0.1` for every request and the throttle
would treat the entire internet as one caller. nginx uses `$proxy_add_x_forwarded_for`, which
appends the real peer, so a client that sends its own `X-Forwarded-For` cannot spoof its way
past it. Override the hop count with `TRUST_PROXY`.

## Tested

82 API checks on 17–18 Oct 2026 — 28 on the password flow, 28 on CORS and the throttle, 26 on
revocation — against throwaway backends and scratch databases (`wazeer_pwtest`, `wazeer_revtest`,
both dropped afterwards), never the live one.

Covered: the flag on create and on reset, self-reset staying permanent, the 403 gate across
several routes, a wrong current password answering 400, refusing to reuse the same password, the
CORS allowlist including lookalike and plain-http origins, preflight, per-caller isolation of the
throttle, reset-on-success, malformed bodies not counting as guesses, and for revocation: a
deleted user's open session being refused on every route and unable to write, a reset locking a
live session to the change screen only, a role change applying both ways to an open session, and
a forged `super_admin` claim on a well-signed token for a non-existent user being ignored.

To re-test, start a backend with `PORT`, `MONGODB_URI`, `JWT_SECRET`, `UPLOAD_DIR` and
`BACKUP_DIR` pointed somewhere throwaway, and drive the endpoints with `X-Forwarded-For` to play
different callers.

## Still open

- **The login page prints the default credentials** (`superadmin / admin123`), and the seeded
  passwords are those literals. Change them and delete the hint in `Login.jsx`.
- **No account lockout and no audit trail of sign-ins.** The throttle slows guessing; it does
  not record who tried.
