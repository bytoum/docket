# Backend tests: design

Date: 2026-11-10
Status: approved in discussion, waiting for spec review

## Goal

Add Docket's first automated test suite. It covers two-factor authentication and the parts of login and user management it touches, runs with `npm test`, and runs in CI on Linux, Windows and macOS.

## Decisions

| Question | Decision |
|---|---|
| What to test first? | Backend 2FA and auth behaviour, turned from the scratch script used while building 2FA into real tests. |
| Test runner | Node's built-in `node:test` with `node:assert/strict`, loading TypeScript through `tsx` (`node --import tsx --test`). No new dependencies. |
| How do tests reach the code? | Over socket.io, against a real backend started as a separate process, the same way the browser does. The server is not run inside the test process, because `DocketServer` calls `process.exit`, starts a cron job, and force-exits on shutdown. |
| Docker in CI? | Not needed. The backend starts without Docker, and these tests don't touch stack, network or volume events. |
| Out of scope | Stack and Docker tests, browser (end-to-end) tests, frontend unit tests, and coverage reports. They can be added later on the same setup. |

## Files

| File | Purpose |
|---|---|
| `test/helpers/backend.ts` | Starts and stops a throwaway backend, and holds the socket helpers. |
| `test/two-fa.test.ts` | The 2FA tests. |
| `package.json` | Adds a `test` script. |
| `.github/workflows/ci.yml` | Adds an `npm test` step after Build. |
| `tsconfig.json` | Adds `"test/**/*"` to `include`. |
| `CLAUDE.md` | Replaces "There is no test suite" with how to run and write tests. |

`test/` is covered by lint (`**/*.{ts,vue}`) and must pass it. `tsconfig.json` currently includes only `backend/**/*` and `common/**/*`. Add `"test/**/*"` so `check-ts` type-checks the tests too.

## The backend helper: `test/helpers/backend.ts`

### `startBackend(): Promise<Backend>`

`Backend` is `{ url: string, stop(): Promise<void> }`. The function:

1. Creates a temporary data folder and an empty stacks folder with `fs.mkdtemp` under `os.tmpdir()`.
2. Finds a free port: it listens on port 0 with `net.createServer`, reads the assigned port, then closes the server.
3. Spawns `process.execPath` with `["--import", "tsx", "./backend/index.ts"]` from the repo root. The environment is `process.env` plus `DOCKET_PORT`, `DOCKET_DATA_DIR`, `DOCKET_STACKS_DIR` and `NODE_ENV=development`. Variables set here take precedence over the repo's `.env` (dotenv does not override them), so tests never touch a developer's real data folder.
4. Collects stdout and stderr in memory, and resolves when the output contains `Listening on`.
5. Rejects if the process exits first, or if 30 s pass. The error includes the last 50 lines of output.

### `stop()`

Kills the process (`SIGTERM`; on Windows, plain `kill()`). If it hasn't exited after 5 s, it sends `SIGKILL`. It waits for the exit, then removes both temporary folders with `fs.rm(..., { recursive: true, force: true })`. Calling it twice is safe.

### Socket helpers

| Helper | Behaviour |
|---|---|
| `connect(url): Promise<Socket>` | A new socket.io client (`transports: ["websocket"]`, `forceNew: true`) that resolves on `connect` and rejects on `connect_error`. Each helper-created socket is tracked so `closeAll()` can disconnect them. |
| `call(socket, event, ...args): Promise<any>` | Emits and resolves with the callback's first argument. Rejects after 5 s with `` `No reply to "${event}"` ``. |
| `callOnce(socket, event, ...args): Promise<any>` | Like `call`, but waits 300 ms after the first reply and rejects with `` `"${event}" replied more than once` `` if a second one arrives. |
| `codeFor(uri: string, offsetSteps = 0): string` | The TOTP code for the secret in an `otpauth://` URI, using `otpauth`; `offsetSteps` shifts by 30 s steps. |
| `setupUsers(url)` | Calls `setup` to create the owner `owner` / `Owner12345`, then logs in as the owner and calls `addUser` for `tester` / `Tester12345`. Returns `{ ownerID, testerID }`. |
| `closeAll()` | Disconnects every socket the helpers opened. |

## The tests: `test/two-fa.test.ts`

One `describe("two-factor authentication")` with a single backend from `before(startBackend)`, cleaned up in `after` with `closeAll()` and then `stop()`. Tests run in order and build on each other. Each `it` checks one behaviour:

**Setup (as tester)**
1. `twoFAStatus` is `false` at first.
2. `prepare2FA` with a wrong password fails.
3. `prepare2FA` twice returns the same URI.
4. `verifyToken`: a valid code gives `valid: true`; `"000000"` (unless it happens to be the current code) and a number give `valid: false`.
5. `save2FA` enables 2FA; then `twoFAStatus` is `true`, and `prepare2FA` replies `twoFAAlreadyEnabled`.

**Login**
6. Password only → `{ tokenRequired: true }`, replied once.
7. A non-numeric code → `authInvalidToken`, replied once.
8. A valid code → `ok` with a JWT, replied once.
9. The same code again → `authInvalidToken`; the same code with a space in the middle → `authInvalidToken`.
10. A wrong password with 2FA on → `authIncorrectCreds` (no `tokenRequired`).

**Owner reset**
11. Tester calling `resetUser2FA` → `ownerOnly`.
12. `getUserList` as owner shows `twoFA: true` for tester, and no row has a key matching `/twofa_|secret/`.
13. Owner resetting themselves → `cannotChangeOwnUser`; an unknown ID → `userNotFound`.
14. Owner resetting tester → `ok`; tester's `twoFAStatus` is then `false`.

**Other rules**
15. After 2FA is off, login with password plus any code → `ok` (the code is ignored).
16. A pending secret is cleared by a password change: `prepare2FA`, then `changePassword`, then `prepare2FA` gives a different URI. Afterwards the password is changed back.
17. A logged-out socket calling `verifyToken` gets an error, not `valid`.
18. `disable2FA` turns 2FA off.

**Rate limits.** Login is limited to 20 per minute and 2FA code checks to 30, both across the whole server. This file must stay under both; the plan counts the calls. If a later change pushes it over, split the file, which gives a fresh backend and fresh limits. Don't loosen the limiters.

**Clock edge.** A code generated just before a 30 s boundary can still verify, because of the ±1 step window. Tests that need a code to *fail* must not rely on timing; they use non-numeric input or a code already used.

## `package.json` and CI

- `"test": "node --import tsx --test \"test/**/*.test.ts\""`. Quote the glob so Node expands it, not the shell; that's required for Windows. Node 22's `--test` supports globs. If Windows CI shows otherwise, list the files explicitly.
- CI: add a `- name: Test` / `run: npm test` step after Build, in the existing job, so it runs on all three operating systems.

## CLAUDE.md

Replace line 22 ("There is no test suite. …") with: tests live in `test/`, run with `npm test` (`node:test` + `tsx`), start a real backend per file on a free port with temporary data, and talk to it over socket.io. CI runs `lint`, `check-ts`, `build:frontend` and `test` on all three operating systems, and all must pass. Add `npm test` to the Commands block.

## Testing this work

- `npm test` passes locally on macOS with Node 22. Run it twice in a row to show no leftover state.
- Make one behaviour wrong on purpose (for example, comment out the replay check in `login`) and confirm the matching test fails with a clear message. Then restore it.
- `npm run lint`, `npm run check-ts` and `npm run build:frontend` still pass.
- After a push, CI is green on Linux, Windows and macOS. That is checked when you push; no push happens without your go-ahead.
