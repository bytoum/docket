# Two-factor authentication: design

Date: 2026-11-10
Status: approved in discussion, waiting for spec review

## Goal

Each Docket user can protect their own account with a time-based one-time code (TOTP) from an authenticator app, in addition to their password.

## Decisions

| Question | Decision |
|---|---|
| Who decides whether 2FA is used? | Each user, for their own account (opt-in). There is no global requirement. |
| Which method? | TOTP only: 6 digits, 30-second step, SHA-1 (what authenticator apps expect). No SMS, email or WebAuthn. |
| How does a user who lost their device get back in? | The owner resets that user's 2FA from the Users list. The owner gets back in through `npm run reset-password`, which can also turn off 2FA. No backup codes. |
| Library | `otpauth` (pure JS, ships TypeScript types, maintained). It is a backend runtime dependency, so it goes in `dependencies`. |

## Current state

Code left over from Uptime Kuma is partly in place:

- The `user` table already has `twofa_secret` (string 64), `twofa_status` (boolean) and `twofa_last_token` (string 6). **No migration is needed.**
- `Login.vue` shows a 6-digit code field when `login` replies `{ tokenRequired: true }`.
- `TwoFADialog.vue` has the whole setup flow (QR code via `vue-qrcode`, verify, save, disable). `Security.vue` hides it with `v-if="... && false"`.
- `twoFaRateLimiter` exists in `backend/rate-limiter.ts` but nothing uses it.

What is broken or missing:

- The events the dialog calls (`twoFAStatus`, `prepare2FA`, `verifyToken`, `save2FA`, `disable2FA`) do not exist on the backend.
- The `login` handler calls `notp.totp.verify(...)` and uses `twoFAVerifyOptions`. Neither is imported and no TOTP library is installed, so a user with 2FA on crashes the handler.
- If a client sends a `token` for a user without 2FA, `login` calls `callback` twice.
- None of the dialog's strings exist in `en.json`.

## Backend

### Shared TOTP helper: `backend/two-fa.ts`

This small module holds every use of `otpauth`, so handlers do not use the library directly.

- `generateSecret(): string`: a new random 20-byte secret, base32-encoded.
- `buildURI(secret, username): string`: an `otpauth://totp/...` URI with issuer `Docket` and label `username`.
- `verifyToken(token, secret): boolean`: `true` if `token` is 6 digits and matches the current step or one step either side (`window: 1`, about ±30 s of clock drift).

### Login (`main-socket-handler.ts`, `login` event)

Rewrite the 2FA part so that every path calls `callback` exactly once:

1. Wrong username or password → `authIncorrectCreds` (unchanged).
2. `twofa_status` is off → log in. Any `token` sent is ignored.
3. `twofa_status` is on and no `token` was sent → `{ tokenRequired: true }`.
4. `twofa_status` is on and a `token` was sent:
   - first pass `twoFaRateLimiter`; if it fails, the limiter replies and the handler returns;
   - if `token === twofa_last_token` or `verifyToken(token, twofa_secret)` is false → `authInvalidToken`;
   - otherwise save `twofa_last_token = token`, log in, and reply with the JWT.

`loginByToken` is unchanged. A session that already exists keeps working when 2FA is turned on, the same as after a password change.

### Self-service events: `backend/socket-handlers/two-fa-socket-handler.ts`

This is a new local-only `SocketHandler`, registered in `DocketServer.socketHandlerList` and not proxied to agents. Every event calls `checkLogin(socket)` first, acts only on `socket.userID`, and replies with `callbackResult` / `callbackError` using i18n keys. Events that take `currentPassword` check it with `doubleCheckPassword(socket, currentPassword)`.

| Event | Behaviour |
|---|---|
| `twoFAStatus(callback)` | `{ ok, status: boolean }`. |
| `prepare2FA(currentPassword, callback)` | If 2FA is already on → `twoFAAlreadyEnabled`. Otherwise, if there is no `twofa_secret`, generate one and save it while `twofa_status` stays 0. Reply `{ ok, uri }`. |
| `verifyToken(token, currentPassword, callback)` | Passes `twoFaRateLimiter`. Checks `token` against the stored secret and replies `{ ok, valid: boolean }`. |
| `save2FA(currentPassword, callback)` | If there is no `twofa_secret` → `twoFANotPrepared`. Otherwise set `twofa_status = 1` and reply `twoFAEnabled`. |
| `disable2FA(currentPassword, callback)` | Set `twofa_status = 0`, `twofa_secret = NULL`, `twofa_last_token = NULL`, then reply `twoFADisabled`. |

### Owner reset (`user-socket-handler.ts`)

- `getUserList` also returns `twoFA: boolean` (from `twofa_status`) for each user. It still never returns the secret or the last token.
- New event `resetUser2FA(userID, callback)`: `checkLogin`, then `requireOwner`. If the target is the caller → `cannotChangeOwnUser`, because the owner turns off their own 2FA in Settings. If the target does not exist → `userNotFound`. Otherwise clear the three 2FA columns as `disable2FA` does. The target's open sessions are not ended.

### Agents (`agent-manager.ts`)

When the `login` call to a remote instance replies `tokenRequired`, treat that agent as failed with the i18n message `agentTwoFAError` ("This agent's account uses 2FA. Use an account without 2FA for agent connections."), shown wherever agent login errors show today.

### `extra/reset-password.ts`

After the new password is saved, if the user has `twofa_status = 1`, ask `Also turn off 2FA for this user? (y/N)`. Answering `y` clears the three 2FA columns.

## Frontend

### Settings → Security (`Security.vue`)

Remove `&& false` so the "Two Factor Authentication" block shows whenever auth is enabled. Show an Active/Inactive status next to the heading, loaded with `twoFAStatus` and refreshed when the dialog closes.

### `TwoFADialog.vue`

The flow is unchanged:

1. Password → **Enable 2FA** (`prepare2FA`).
2. Scan the QR code. **Show secret** reveals the base32 key for manual entry; it replaces the old "Show URI".
3. Type a code → **Verify** (`verifyToken`) → **Save**, with a confirmation (`save2FA`).
4. When 2FA is on, the dialog shows **Disable 2FA**, which needs the password and a confirmation (`disable2FA`).

Clean-up:

- The badges and the success message use the tokens from `vars.scss` instead of `bg-primary` and the inline `color: green`.
- The QR code keeps its white background so it scans in dark mode.
- Closing the dialog clears `currentPassword`, `token`, `uri` and the shown secret.

### `Login.vue`

It already switches to the code field on `tokenRequired`. Check that the username and password are kept, the code field gets focus, and `authInvalidToken` shows translated. Fix only what is broken.

### `Users.vue`

- Show a "2FA" badge on users with `twoFA: true`.
- The owner sees **Reset 2FA** on other users who have 2FA on. It opens a `Confirm` with `reset2FAMsg` ("Turn off 2FA for {0}? They will be able to log in with just their password.") and then emits `resetUser2FA`.

### i18n

Add to `frontend/src/lang/en.json` only:

- Strings the existing dialog and login already reference: `Setup 2FA`, `Enable 2FA`, `Disable 2FA`, `2FA Settings`, `Two Factor Authentication`, `Active`, `Inactive`, `Verify Token`, `Token`, `twoFAVerifyLabel`, `tokenValidSettingsMsg`, `confirmEnableTwoFAMsg`, `confirmDisableTwoFAMsg`, `authInvalidToken`. Before adding each one, check whether it already exists under that key.
- New strings: `Show secret`, `twoFAAlreadyEnabled`, `twoFANotPrepared`, `twoFAEnabled`, `twoFADisabled`, `twoFABadge`, `reset2FA`, `reset2FATitle`, `reset2FAMsg`, `agentTwoFAError`.

## Error handling

- Every error reply uses an i18n key (`msgi18n: true`).
- A wrong password, an invalid code, a reused code and too many attempts each produce a distinct message.
- The secret never leaves the backend except as part of the URI returned by `prepare2FA` while 2FA is still off.

## Testing

There is no automated suite. Do a manual pass on the dev servers with a real authenticator app:

1. Enable 2FA (wrong password refused; wrong code fails verify; correct code saves).
2. Log out, then log in: code requested; wrong code refused; correct code accepted; the same code reused within its window refused.
3. Disable 2FA, then log in with just the password.
4. Owner resets another user's 2FA; that user logs in with just the password.
5. A non-owner sending `resetUser2FA` is refused with `ownerOnly`.
6. `npm run reset-password` on a 2FA user, answering `y`, turns off 2FA.
7. An agent pointed at an account with 2FA shows `agentTwoFAError`.
8. Dark mode: the QR code scans and the badges are readable.

`npm run lint`, `npm run check-ts` and `npm run build:frontend` must pass.

## Out of scope

Backup codes, a global or owner-enforced 2FA requirement, "remember this device", WebAuthn/passkeys, and 2FA for agent connections.
