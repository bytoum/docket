# Backend Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Docket's first automated test suite. `npm test` runs socket.io tests for 2FA against a real throwaway backend, locally and in CI on Linux, Windows and macOS.

**Architecture:** A helper in `test/helpers/backend.ts` spawns `backend/index.ts` as a child process on a free port with temporary data and stacks folders, waits for `Listening on`, and tears everything down afterwards. Tests in `test/*.test.ts` use `node:test` and `node:assert/strict`, and talk to the backend with `socket.io-client`.

**Tech Stack:** Node 22 `node:test`, `tsx` (already installed), `socket.io-client` and `otpauth` (already installed).

**Spec:** `docs/superpowers/specs/2026-11-10-backend-tests-design.md`

## Global Constraints

- Node 22: `PATH=~/.nvm/versions/node/v22.12.0/bin:$PATH`. No new dependencies.
- Test script: `"test": "node --import tsx --test \"test/**/*.test.ts\""`. The glob is quoted so Node expands it (needed on Windows).
- Backend env for tests: `DOCKET_PORT`, `DOCKET_DATA_DIR`, `DOCKET_STACKS_DIR` (temporary folders under `os.tmpdir()`), `NODE_ENV=development`. Never the repo's `./data`.
- Timeouts: backend start 30 s (the error includes the last 50 output lines); `call` 5 s (`No reply to "<event>"`); `callOnce` waits 300 ms for a duplicate (`"<event>" replied more than once`); `stop` sends a forced kill after 5 s.
- Fixed users: `owner` / `Owner12345` and `tester` / `Tester12345`.
- Rate limits are global per backend: login 20/min, 2FA code checks 30/min. A test file must stay under both. Split files rather than loosen the limiters.
- Tests needing a code to *fail* use non-numeric input or an already-used code, never timing.
- 4-space indentation, JSDoc on helper functions, camelCase. `npm run lint` (0 errors), `npm run check-ts` and `npm run build:frontend` must pass.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Leftover processes or folders when a test fails midway:** `after()` still runs `closeAll()` and `stop()`, and `stop()` is safe to call twice. Pinned in Task 1's smoke test, which calls `stop()` twice and checks the data folder is gone.
2. **A developer's `.env` points `DOCKET_DATA_DIR` at real data:** the env set by the helper wins. Pinned in Task 1 by asserting the spawned backend's data folder (from the backend log, or the temporary folder now containing `docket.db`) is the temporary one.
3. **The backend never starts (bad native module, port race):** the test fails within 30 s with the backend's own output, instead of hanging. Pinned in Task 1 by starting with an invalid entry path and expecting a rejection that includes output.
4. **A handler that never replies:** the test fails with the event name after 5 s. Pinned in Task 1 by calling a made-up event (`"noSuchEvent"`) and expecting the `No reply to "noSuchEvent"` rejection.
5. **Running `npm test` twice in a row:** the second run passes too (fresh port, fresh data). Pinned in Task 2, Step 4.

---

### Task 1: Backend test helper and smoke test

**Files:**
- Create: `test/helpers/backend.ts`
- Create: `test/backend-helper.test.ts`
- Modify: `package.json` (`scripts.test`), `tsconfig.json` (`include` gains `"test/**/*"`)

**Interfaces:**
- Produces, from `test/helpers/backend.ts`:
  - `interface Backend { url: string; dataDir: string; stop(): Promise<void> }`
  - `startBackend(entry = "./backend/index.ts"): Promise<Backend>`
  - `connect(url: string): Promise<Socket>`
  - `call(socket: Socket, event: string, ...args: unknown[]): Promise<any>`
  - `callOnce(socket: Socket, event: string, ...args: unknown[]): Promise<any>`
  - `codeFor(uri: string, offsetSteps = 0): string`
  - `setupUsers(url: string): Promise<{ ownerID: number; testerID: number }>`
  - `closeAll(): void`
  - constants `OWNER` and `TESTER` (`{ username, password }`)

- [ ] **Step 1: Write the smoke test `test/backend-helper.test.ts`**

`describe("test backend helper")`, with these `it`s:
- `"starts a backend with temporary data"`: `startBackend()` resolves; `backend.dataDir` starts with `os.tmpdir()` (compare `fs.realpathSync` of both, because macOS `/var` is a symlink to `/private/var`); after `setupUsers`, `fs.existsSync(path.join(dataDir, "docket.db"))` is true; `ownerID` and `testerID` are numbers and differ.
- `"rejects a call that gets no reply"`: `await assert.rejects(call(s, "noSuchEvent"), /No reply to "noSuchEvent"/)`.
- `"logs in with the fixed users"`: `callOnce(s, "login", TESTER)` gives `ok === true`.
- `"stop removes the data folder and is safe twice"`: `await backend.stop(); await backend.stop();`, then `fs.existsSync(dataDir)` is false.
- `"reports output when the backend fails to start"`: `await assert.rejects(startBackend("./test/helpers/does-not-exist.ts"), (e) => /exited|timed out/i.test(e.message) && e.message.length > 40)`.

- [ ] **Step 2: Add the scripts**

`package.json`: add `"test"` per Global Constraints. `tsconfig.json`: add `"test/**/*"` to `include`.

- [ ] **Step 3: Run it to see it fail**

Run: `npm test`
Expected: FAIL (cannot find `./helpers/backend`).

- [ ] **Step 4: Implement `test/helpers/backend.ts`** per the spec section "The backend helper". Notes:
- Spawn with `spawn(process.execPath, ["--import", "tsx", entry], { cwd: repoRoot, env: { ...process.env, ...overrides } })`, where `repoRoot` is resolved from `import.meta.url` (two levels up), not from `process.cwd()`.
- Temporary folders use the prefix `docket-test-` (`fs.mkdtemp(path.join(os.tmpdir(), "docket-test-"))`); the stacks folder is a `stacks/` subfolder of the data folder, so one `rm` removes both.
- Keep a ring buffer of the last 50 output lines for error messages.
- `stop()` keeps an `exited` promise, so a second call returns at once.
- Close the probe server before spawning, to avoid a port race.

- [ ] **Step 5: Run it and see it pass**

Run: `npm test`
Expected: all 5 smoke tests pass; output ends with `# fail 0`.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
npm run lint && npm run check-ts
git add test/ package.json tsconfig.json
git commit -m "Add a test helper that runs a throwaway backend"
```

---

### Task 2: 2FA tests

**Files:**
- Create: `test/two-fa.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces.

- [ ] **Step 1: Write the 18 tests** listed in the spec under "The tests", in that order, in one `describe("two-factor authentication")` with `before` (`startBackend`, `setupUsers`) and `after` (`closeAll`, `stop`). Notes:
- Each `login` attempt uses a **fresh** socket (`connect`), because a successful login authenticates the socket.
- Use `callOnce` for tests 6–8; `call` elsewhere.
- Test 9's spaced replay: `` `${code.slice(0, 3)} ${code.slice(3)}` ``.
- Test 16 uses `changePassword` with the payload `{ currentPassword, newPassword, repeatNewPassword }` (check the handler in `backend/socket-handlers/main-socket-handler.ts` for the exact field names), and then changes the password back.
- Budget: count `login` calls (≤ 20) and `verifyToken` plus code-carrying `login` calls (≤ 30). Note both totals in a comment at the top of the file.

- [ ] **Step 2: Run them**

Run: `npm test`
Expected: smoke tests + 18 2FA tests pass, `# fail 0`.

- [ ] **Step 3: Prove a test catches a real bug**

Temporarily comment out the `twofa_last_token` replay rejection in the `login` handler (`backend/socket-handlers/main-socket-handler.ts`) and run `npm test`. Expected: test 9 fails, naming the reused code. Restore the line (`git diff` shows no change to that file) and run again: everything passes.

- [ ] **Step 4: Run twice in a row**

Run: `npm test && npm test`
Expected: both pass. `ls $TMPDIR` (or `os.tmpdir()`) shows no leftover `docket-test-*` folders.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run check-ts
git add test/two-fa.test.ts
git commit -m "Add automated tests for two-factor authentication"
```

---

### Task 3: CI and docs

**Files:**
- Modify: `.github/workflows/ci.yml` (a new step after Build)
- Modify: `CLAUDE.md` (line 22 and the Commands block)

- [ ] **Step 1: CI step**

After the `Build` step, add:
```yaml
      - name: Test
        run: npm test
```
Replace the comment `# more things can be add later like tests etc..` (it is now done).

- [ ] **Step 2: CLAUDE.md**

Replace "There is no test suite. CI (...) runs `lint`, `check-ts` and `build:frontend` on Linux, Windows and macOS. All three must pass." with the text in the spec's "CLAUDE.md" section. Add `npm test                 # backend tests (node:test + tsx, starts a throwaway backend)` to the Commands block after `check-ts`.

- [ ] **Step 3: Full local check**

Run: `npm run lint && npm run check-ts && npm run build:frontend && npm test`
Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml CLAUDE.md
git commit -m "Run the tests in CI and document them"
```

CI on Windows and macOS is confirmed only after you push. No push without your go-ahead.
