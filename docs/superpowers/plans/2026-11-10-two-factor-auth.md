# Two-Factor Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each Docket user turn on TOTP two-factor authentication for their own account, with owner reset and a CLI way back in.

**Architecture:** A small `backend/two-fa.ts` module wraps `otpauth`. A new local-only `TwoFASocketHandler` serves the setup events that the existing (hidden) `TwoFADialog.vue` already calls. The `login` handler's broken 2FA branch is rewritten on top of the helper. The owner reset goes in `UserSocketHandler`. No migration: the `twofa_*` columns already exist.

**Tech Stack:** TypeScript backend (Express + socket.io, run with `tsx`), `otpauth`, Vue 3 Options API, bootstrap-vue-next, `vue-qrcode` (already installed).

**Spec:** `docs/superpowers/specs/2026-11-10-two-factor-auth-design.md`

## Global Constraints

- Node 22 (`PATH=~/.nvm/versions/node/v22.12.0/bin:$PATH`). No native build dependencies.
- `otpauth` goes in `dependencies` (backend runtime), pinned `~9.5.2`.
- TOTP: 6 digits, 30-second period, SHA1, issuer `Docket`, label = username, verify window `1`.
- New UI strings go **only** in `frontend/src/lang/en.json`. Never edit the other `frontend/src/lang/*.json` files.
- Socket replies use `callbackResult` / `callbackError`; error messages are i18n keys (`msgi18n: true`).
- The secret is never sent to the client except inside the URI from `prepare2FA` while 2FA is off. `getUserList` returns only `twoFA: boolean`.
- 4-space indentation, JSDoc on every new function and method, camelCase in TS, snake_case DB columns.
- There is no test suite. Each task is checked with `npm run lint` and `npm run check-ts`, plus the verification command or script given in the task. `npm run build:frontend` must pass at the end.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A code typed with a space or pasted with spaces** ("123 456"): accepted. `verifyToken` strips whitespace before checking. Pinned in Task 1's check.
2. **A non-string, empty or 5-digit `token`** from a client: rejected as `authInvalidToken` (login) or `valid: false` (setup), never a crash. Pinned in Task 1's check and Task 3's script.
3. **The same valid code sent again** after a successful login within its 30 s window: rejected (`authInvalidToken`). Pinned in Task 3's script.
4. **`prepare2FA` called twice** (dialog closed and reopened before saving): returns the same URI, so a code from the already-scanned QR still verifies. Pinned in Task 2's script.
5. **2FA turned off while a user is at the code prompt** (owner reset or disable): their next submit logs them in with just the password, and the code they send is ignored. Pinned in Task 3's script (login with a token after `disable2FA`).

---

### Task 1: TOTP helper

**Files:**
- Modify: `package.json`, `package-lock.json` (add `"otpauth": "~9.5.2"` to `dependencies`)
- Create: `backend/two-fa.ts`

**Interfaces:**
- Produces:
  - `generateSecret(): string`: a new random 20-byte secret, base32
  - `buildURI(secret: string, username: string): string`: an `otpauth://totp/...` URI
  - `verifyToken(token: unknown, secret: string | null | undefined): boolean`

- [ ] **Step 1: Install the dependency**

Run: `npm install otpauth@~9.5.2 --save`
Expected: `package.json` `dependencies` contains `"otpauth": "~9.5.2"`.

- [ ] **Step 2: Implement `backend/two-fa.ts`**

Use `OTPAuth.Secret` (`size: 20`, `.base32`) and `OTPAuth.TOTP({ issuer: "Docket", label: username, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) })`. In `verifyToken`: return `false` unless `token` is a string and `secret` is a non-empty string; strip all whitespace; return `false` unless the result matches `/^\d{6}$/`; then return `totp.validate({ token, window: 1 }) !== null`.

- [ ] **Step 3: Check the helper**

Run:
```bash
npx tsx -e '
import * as OTPAuth from "otpauth";
import { generateSecret, buildURI, verifyToken } from "./backend/two-fa";
const s = generateSecret();
const t = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(s) });
const code = t.generate();
const prev = t.generate({ timestamp: Date.now() - 30000 });
const old = t.generate({ timestamp: Date.now() - 120000 });
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); process.exit(1); } };
ok(/^[A-Z2-7]{32}$/.test(s), "secret is 32 base32 chars");
ok(buildURI(s, "alice").startsWith("otpauth://totp/Docket:alice?"), "uri");
ok(buildURI(s, "alice").includes("issuer=Docket"), "issuer");
ok(verifyToken(code, s), "current code");
ok(verifyToken(prev, s), "previous step within window");
ok(verifyToken(code.slice(0,3) + " " + code.slice(3), s), "space stripped");
ok(!verifyToken(old, s), "old code rejected");
ok(!verifyToken(123456, s), "number rejected");
ok(!verifyToken("", s) && !verifyToken("12345", s), "empty / short rejected");
ok(!verifyToken(code, null), "no secret rejected");
console.log("PASS");
'
```
Expected: `PASS` (if `old` happens to match by chance, rerun).

- [ ] **Step 4: Lint and typecheck**

Run: `npm run lint && npm run check-ts`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json backend/two-fa.ts
git commit -m "Add TOTP helper for two-factor authentication"
```

---

### Task 2: Self-service 2FA events

**Files:**
- Create: `backend/socket-handlers/two-fa-socket-handler.ts`
- Modify: `backend/docket-server.ts:80-84` (add `new TwoFASocketHandler()` to `socketHandlerList`)
- Modify: `frontend/src/lang/en.json`
- Create (scratch, not committed): `$SCRATCH/verify-2fa.ts` (where `$SCRATCH` is the session scratchpad)

**Interfaces:**
- Consumes: `generateSecret`, `buildURI`, `verifyToken` (Task 1); `checkLogin`, `doubleCheckPassword`, `callbackResult`, `callbackError` from `backend/util-server.ts`; `twoFaRateLimiter` from `backend/rate-limiter.ts`.
- Produces: socket events (all callbacks are the last argument):
  - `twoFAStatus(cb)` → `{ ok: true, status: boolean }`
  - `prepare2FA(currentPassword, cb)` → `{ ok: true, uri: string }` | error `twoFAAlreadyEnabled`
  - `verifyToken(token, currentPassword, cb)` → `{ ok: true, valid: boolean }`
  - `save2FA(currentPassword, cb)` → `{ ok: true, msg: "twoFAEnabled", msgi18n: true }` | error `twoFANotPrepared`
  - `disable2FA(currentPassword, cb)` → `{ ok: true, msg: "twoFADisabled", msgi18n: true }`
  - Task 4 and Task 7 reuse the "clear 2FA" update: export `clearTwoFA(userID: number): Promise<void>` from `backend/two-fa.ts` (`UPDATE user SET twofa_status = 0, twofa_secret = NULL, twofa_last_token = NULL WHERE id = ?`).

- [ ] **Step 1: Add `clearTwoFA(userID)` to `backend/two-fa.ts`** (uses `R.exec`).

- [ ] **Step 2: Implement `TwoFASocketHandler`**

Follow the shape of `backend/socket-handlers/user-socket-handler.ts`: each handler is `try { checkLogin(socket); ... } catch (e) { callbackError(e, callback); }`. Password-taking events call `const user = await doubleCheckPassword(socket, currentPassword)` and use that row. `prepare2FA` reuses an existing `twofa_secret` if one is stored and only generates and saves a new one when it is empty. `verifyToken` calls `if (!await twoFaRateLimiter.pass(callback)) return;` before anything else. Use `!!user.twofa_status` everywhere (SQLite returns 0/1). JSDoc on the class and `create`.

- [ ] **Step 3: Register the handler** in `DocketServer.socketHandlerList` after `new UserSocketHandler()`.

- [ ] **Step 4: Add the strings to `en.json`**

Grep each key first; add only the missing ones:
```json
"twoFAAlreadyEnabled": "Two-factor authentication is already enabled.",
"twoFANotPrepared": "Start the 2FA setup first.",
"twoFAEnabled": "Two-factor authentication enabled.",
"twoFADisabled": "Two-factor authentication disabled."
```

- [ ] **Step 5: Write the verification script `$SCRATCH/verify-2fa.ts`**

A `socket.io-client` script, run from the repo root with `npx tsx $SCRATCH/verify-2fa.ts`. It reads `DOCKET_TEST_USER` / `DOCKET_TEST_PASS` (a non-owner test user you create in the dev UI first) and connects to `http://localhost:5001`. A small `call(event, ...args)` helper turns emit callbacks into promises, and an `assert(cond, msg)` exits 1 with `FAIL msg`. Generate codes with `new OTPAuth.TOTP({ secret })`, taking the secret from the `secret=` URI parameter. Steps for this task:
1. `login` with the password → `ok`.
2. `twoFAStatus` → `status === false`.
3. `prepare2FA("wrong")` → `ok === false`.
4. `prepare2FA(pass)` twice → `ok` and the **same** `uri` both times (Review Focus 4).
5. `verifyToken("000000", pass)` → `valid === false` (unless it really is the code); `verifyToken(code, pass)` → `valid === true`; `verifyToken(12345, pass)` → `valid === false`.
6. `save2FA(pass)` → `ok`; `twoFAStatus` → `status === true`; `prepare2FA(pass)` → `msg === "twoFAAlreadyEnabled"`.
7. `disable2FA(pass)` → `ok`; `twoFAStatus` → `status === false`.
Print `PASS` at the end. Task 3 adds the login steps between 6 and 7.

- [ ] **Step 6: Run it against the dev backend**

Run (backend in another terminal): `PATH=~/.nvm/versions/node/v22.12.0/bin:$PATH DOCKET_STACKS_DIR=$PWD/stacks npm run dev:backend`, then `DOCKET_TEST_USER=... DOCKET_TEST_PASS=... npx tsx $SCRATCH/verify-2fa.ts`
Expected: `PASS`.

- [ ] **Step 7: Lint, typecheck, commit**

Run: `npm run lint && npm run check-ts` (expected: exit 0), then:
```bash
git add backend/two-fa.ts backend/socket-handlers/two-fa-socket-handler.ts backend/docket-server.ts frontend/src/lang/en.json
git commit -m "Add socket events to set up and disable 2FA"
```

---

### Task 3: Fix 2FA at login

**Files:**
- Modify: `backend/socket-handlers/main-socket-handler.ts:141-224` (`login` event) and its imports (drop nothing used elsewhere; add `verifyToken` from `../two-fa`)
- Modify: `frontend/src/mixins/socket.ts:336-360` (`login`)
- Modify: `frontend/src/components/Login.vue`
- Modify: `frontend/src/lang/en.json`
- Modify (scratch): `$SCRATCH/verify-2fa.ts`

**Interfaces:**
- Consumes: `verifyToken(token, secret)` (Task 1); events from Task 2 (for the script).
- Produces: `login({ username, password, token? }, cb)` replies exactly once with one of: `{ ok: true, token: jwt }`, `{ tokenRequired: true }`, `{ ok: false, msg: "authIncorrectCreds" | "authInvalidToken", msgi18n: true }`, or the rate limiter's `{ ok: false, msg }`.

- [ ] **Step 1: Extend the script first**

Between steps 6 and 7 of `verify-2fa.ts`, open a **second** client connection and:
- a. `login({ username, password })` → `tokenRequired === true` and `ok` is not `true`.
- b. `login({ username, password, token: "abc" })` → `msg === "authInvalidToken"`.
- c. `login({ username, password, token: code })` → `ok === true` and `token` is a string.
- d. On a third connection, the same `code` again → `msg === "authInvalidToken"` (Review Focus 3).
- e. Count callback invocations in a–d: each fires **once** (wait 300 ms after each reply to catch a second call).

After step 7 (`disable2FA`), on a fresh connection, `login({ username, password, token: "999999" })` → `ok === true` (Review Focus 5).

- [ ] **Step 2: Run it and see it fail**

Run: `npx tsx $SCRATCH/verify-2fa.ts`
Expected: FAIL at step c (`notp is not defined` in the backend log, or a missing reply).

- [ ] **Step 3: Rewrite the 2FA part of `login`**

Follow the four-case order in the spec ("Login" section): off → log in; on and no token → `tokenRequired`; on and token → `twoFaRateLimiter.pass(callback)` first, then reject if `token === user.twofa_last_token || !verifyToken(token, user.twofa_secret)`, else save `twofa_last_token` with `user.id` (not `socket.userID`, which `afterLogin` sets) and log in. Use `if / else if / else` with `return`s so there is one callback per path. Check the status with `!!user.twofa_status`. Keep the existing log lines.

- [ ] **Step 4: Fix the frontend**

- `socket.ts` `login`: when `res.tokenRequired`, call `callback(res)` and `return` (today it calls `callback` twice).
- `Login.vue`: after `tokenRequired` becomes true, clear `res` and `token`, then `this.$nextTick(() => document.getElementById("otp")?.focus())`. Add `inputmode="numeric"` to the `#otp` input. Leave the username and password in `data`; they are already resent on submit.

- [ ] **Step 5: Add the strings to `en.json`** (only the missing ones):
```json
"Token": "Authentication code",
"authInvalidToken": "Invalid or already used authentication code."
```

- [ ] **Step 6: Run the script**

Run: `npx tsx $SCRATCH/verify-2fa.ts`
Expected: `PASS`.

- [ ] **Step 7: Manual check in the browser**

Start the frontend (`npm run dev:frontend -- --port 5173 --strictPort`). Enable 2FA for the test user with the script stopped after step 6 (or temporarily skip step 7). Log in through the UI: the code field appears and has focus; a wrong code shows "Invalid or already used authentication code."; the correct code logs in. Disable 2FA afterwards.

- [ ] **Step 8: Lint, typecheck, commit**

Run: `npm run lint && npm run check-ts` (expected: exit 0), then:
```bash
git add backend/socket-handlers/main-socket-handler.ts frontend/src/mixins/socket.ts frontend/src/components/Login.vue frontend/src/lang/en.json
git commit -m "Fix two-factor authentication at login"
```

---

### Task 4: Owner reset of a user's 2FA

**Files:**
- Modify: `backend/socket-handlers/user-socket-handler.ts` (`getUserList`; new `resetUser2FA`)
- Modify: `frontend/src/components/settings/Users.vue`
- Modify: `frontend/src/lang/en.json`
- Modify (scratch): `$SCRATCH/verify-2fa.ts`

**Interfaces:**
- Consumes: `clearTwoFA(userID)` (Task 2); `requireOwner(socket)` from `util-server.ts`.
- Produces:
  - `getUserList` rows gain `twoFA: boolean`.
  - `resetUser2FA(userID: number, cb)` → `{ ok: true, msg: "twoFAReset", msgi18n: true }` | errors `ownerOnly`, `cannotChangeOwnUser`, `userNotFound`.

- [ ] **Step 1: Extend the script**

Read `DOCKET_OWNER_USER` / `DOCKET_OWNER_PASS` too. After the test user has saved 2FA (step 6):
- the test user calls `resetUser2FA(ownerID)` → `msg === "ownerOnly"`;
- the owner calls `getUserList` → the test user's row has `twoFA === true` and no key matching `/twofa_|secret/`;
- the owner calls `resetUser2FA(ownerOwnID)` → `msg === "cannotChangeOwnUser"`; `resetUser2FA(999999)` → `msg === "userNotFound"`;
- the owner calls `resetUser2FA(testUserID)` → `ok`; then the test user's `twoFAStatus` → `status === false`.
Then re-run `prepare2FA`/`save2FA` so the later steps still have 2FA on.

- [ ] **Step 2: Run it and see it fail**

Expected: FAIL at the `twoFA === true` assertion.

- [ ] **Step 3: Implement the backend**

In `getUserList`, add `twoFA: !!user.twofa_status`. Add `resetUser2FA` next to `setUserActive`, with the same validation order (`requireOwner`, own-user check, existence check), then `await clearTwoFA(target.id)`. Do not disconnect the target's sessions.

- [ ] **Step 4: Implement the UI in `Users.vue`**

- A badge `<span v-if="user.twoFA" class="badge ...">{{ $t("twoFABadge") }}</span>` next to the existing badges, using the same badge style as the owner badge.
- Inside the existing `v-if="isOwner && user.id !== currentUserID"` block: `<button v-if="user.twoFA" type="button" class="btn btn-sm btn-normal" :disabled="processing" @click="confirmReset2FA(user)">{{ $t("reset2FA") }}</button>`.
- A `Confirm` with `ref="confirmReset2FA"`, `btn-style="btn-danger"`, `:yes-text="$t('reset2FA')"`, `:no-text="$t('cancel')"`, `:title="$t('reset2FATitle')"`, body `$t("reset2FAMsg", [ userToReset?.username ?? "" ])`, `@yes="reset2FA"`. Follow the `confirmDelete` / `deleteUser` pattern: data `userToReset`, then emit, toast with `this.$root.toastRes(res)`, and reload the list.

- [ ] **Step 5: Add the strings to `en.json`**
```json
"twoFABadge": "2FA",
"reset2FA": "Reset 2FA",
"reset2FATitle": "Reset two-factor authentication",
"reset2FAMsg": "Turn off 2FA for {0}? They will be able to log in with just their password.",
"twoFAReset": "Two-factor authentication was turned off for this user."
```

- [ ] **Step 6: Run the script, then check the UI**

Run: `npx tsx $SCRATCH/verify-2fa.ts` (expected: `PASS`). In the browser as the owner, open Settings → Users. The test user shows the "2FA" badge and a "Reset 2FA" button. Confirming removes the badge. As the test user, there is no Reset 2FA button.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run check-ts
git add backend/socket-handlers/user-socket-handler.ts frontend/src/components/settings/Users.vue frontend/src/lang/en.json
git commit -m "Let the owner reset another user's 2FA"
```

---

### Task 5: 2FA settings UI

**Files:**
- Modify: `frontend/src/components/settings/Security.vue:67-80` and script
- Modify: `frontend/src/components/TwoFADialog.vue`
- Modify: `frontend/src/lang/en.json`

**Interfaces:**
- Consumes: the events from Task 2.
- Produces: `TwoFADialog` emits `changed` after a successful save or disable. `Security.vue` listens for it to refresh its status.

- [ ] **Step 1: Security.vue**

Change `v-if="! settings.disableAuth && false"` to `v-if="! settings.disableAuth"` and remove the `<!-- TODO: Hidden for now -->` comment. Add `twoFAStatus: null` to `data`, load it in `mounted` with `twoFAStatus`, and show it next to the heading as a badge (`Active` / `Inactive`). Use `<TwoFADialog ref="TwoFADialog" @changed="loadTwoFAStatus" />`.

- [ ] **Step 2: TwoFADialog.vue**

- Replace the "Show URI" button and `<p>{{ uri }}</p>` with **Show secret**, which displays the `secret` query parameter parsed from `uri` (`new URL(uri).searchParams.get("secret")`) in a `<code>` block with `user-select: all`.
- Status badges: Active uses the accent token and Inactive the muted token from `frontend/src/styles/vars.scss`, through a scoped class. No `bg-primary` for both.
- `tokenValidSettingsMsg`: use the success status token instead of `style="color: green;"`.
- Keep the QR's `:color="{ light: '#ffffffff' }"` and wrap it in a white, 4px-radius, padded box so it scans in dark mode.
- Listen for the Bootstrap modal's `hidden.bs.modal` event and reset `currentPassword`, `token`, `uri`, `tokenValid` and the show-secret flag.
- Emit `changed` after `save2FA` and `disable2FA` succeed, and declare `emits: ["changed"]`.

- [ ] **Step 3: Add the strings to `en.json`** (only the missing ones; grep each key first):
```json
"Two Factor Authentication": "Two-factor authentication",
"2FA Settings": "2FA settings",
"Setup 2FA": "Set up 2FA",
"Enable 2FA": "Enable 2FA",
"Disable 2FA": "Disable 2FA",
"Active": "Active",
"Inactive": "Inactive",
"Verify Token": "Verify",
"Show secret": "Show secret",
"twoFAVerifyLabel": "Scan the QR code with your authenticator app, then enter the 6-digit code to verify:",
"tokenValidSettingsMsg": "The code is valid. You can now save the 2FA settings.",
"confirmEnableTwoFAMsg": "Enable two-factor authentication? You will need a code from your authenticator app every time you log in.",
"confirmDisableTwoFAMsg": "Disable two-factor authentication? You will be able to log in with just your password."
```

- [ ] **Step 4: Manual check in light and dark mode**

As the test user: Settings → Security shows "Inactive". Click 2FA settings → password → Enable 2FA → the QR code appears. Show secret shows a 32-character key. A wrong code shows an error toast; the correct code shows the success line. Save → confirm → the dialog shows Active, and the Security page shows "Active" without a reload. Close and reopen the dialog: the password field is empty. Disable → confirm → "Inactive". Switch to dark mode: the QR code still scans from a phone and the badges are readable.

- [ ] **Step 5: Lint, typecheck, build, commit**

```bash
npm run lint && npm run check-ts && npm run build:frontend
git add frontend/src/components/settings/Security.vue frontend/src/components/TwoFADialog.vue frontend/src/lang/en.json
git commit -m "Enable and restyle the 2FA settings dialog"
```

---

### Task 6: Agent accounts with 2FA

**Files:**
- Modify: `backend/agent-manager.ts:50-60` (`test`) and `:157-176` (`connect` login callback)
- Modify: `frontend/src/lang/en.json`

**Interfaces:**
- Produces: `AgentManager.test()` rejects with `new Error("agentTwoFAError")` when the remote replies `tokenRequired`. `addAgent` already passes the error through `callbackError` (`msgi18n: true`), so the add-agent form shows it translated.

- [ ] **Step 1: Implement**

In `test`: `if (res.ok) resolve(); else if (res.tokenRequired) reject(new Error("agentTwoFAError")); else reject(new Error(res.msg));`. In `connect`: when `res.tokenRequired`, log `log.error("agent-manager", "Agent account uses 2FA, cannot log in: " + endpoint)` instead of the generic failure line. The status stays `offline` as today.

- [ ] **Step 2: Add the string to `en.json`**
```json
"agentTwoFAError": "This agent's account uses 2FA. Use an account without 2FA for agent connections."
```

- [ ] **Step 3: Manual check**

Run a second backend on another port with its own data dir, without the debugger so it doesn't clash with the first: `NODE_ENV=development DOCKET_PORT=5002 DOCKET_DATA_DIR=./data-agent/ DOCKET_STACKS_DIR=$PWD/stacks npx tsx ./backend/index.ts`. Create a user there and enable 2FA with the Task 2 script pointed at `:5002`. In the main UI, add that agent: the form shows the agentTwoFAError message. Delete `./data-agent/` afterwards.

- [ ] **Step 4: Lint, typecheck, commit**

```bash
npm run lint && npm run check-ts
git add backend/agent-manager.ts frontend/src/lang/en.json
git commit -m "Explain agent login failures caused by 2FA"
```

---

### Task 7: reset-password can turn off 2FA

**Files:**
- Modify: `extra/reset-password.ts`

**Interfaces:**
- Consumes: `clearTwoFA(userID)` (Task 2); the file's existing `question()` helper.

- [ ] **Step 1: Implement**

After the new password is saved and before the "password reset" success message, add: `if (user.twofa_status) { const a = (await question("Also turn off 2FA for this user? (y/N) ")).trim().toLowerCase(); if (a === "y" || a === "yes") { await clearTwoFA(user.id); console.log("2FA turned off."); } }`. Keep this outside the `TEST_BACKEND` skip path, matching the rest of the reset logic.

- [ ] **Step 2: Manual check**

Enable 2FA for the test user. Stop the dev backend, then run `DOCKET_STACKS_DIR=$PWD/stacks npm run reset-password`, pick the test user, set a password and answer `y`. Start the backend again: the test user logs in with the new password and no code. Repeat answering `n` (after re-enabling 2FA): a code is still requested.

- [ ] **Step 3: Lint, typecheck, commit**

```bash
npm run lint && npm run check-ts
git add extra/reset-password.ts
git commit -m "Offer to turn off 2FA in the reset-password tool"
```

---

### Task 8: Final verification and docs

**Files:**
- Modify: `CLAUDE.md` (one line under "Architecture → Database" or a new short "2FA" note: TOTP via `otpauth` in `backend/two-fa.ts`, events in `two-fa-socket-handler.ts`, the owner reset, and `reset-password` clearing 2FA)

- [ ] **Step 1: Run the full verification script one more time**

Run: `npx tsx $SCRATCH/verify-2fa.ts`
Expected: `PASS`.

- [ ] **Step 2: Run CI's three checks**

Run: `npm run lint && npm run check-ts && npm run build:frontend`
Expected: all exit 0.

- [ ] **Step 3: Confirm that no other language file changed**

Run: `git diff main --stat -- frontend/src/lang/ | grep -v en.json`
Expected: only the summary line, with no other `*.json` files listed.

- [ ] **Step 4: Update CLAUDE.md and commit**

```bash
git add CLAUDE.md
git commit -m "Document two-factor authentication"
```
