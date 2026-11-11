# Deploy Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-stack secret URL (`POST /api/webhook/:token`) that a GitHub Actions step calls to run the stack's Update (pull, then `up -d` if running), returning the result synchronously.

**Architecture:** A `webhook` table stores one SHA-256 token hash per stack. `backend/webhook.ts` owns all webhook DB access. Agent socket events (`getWebhook`/`createWebhook`/`deleteWebhook`) manage it so remote agents work too. A new Express `WebhookRouter` serves the HTTP endpoint and calls `Stack.update(undefined)`. The frontend adds a "Webhook" item to the stack page's more menu that opens `WebhookDrawer.vue`.

**Tech Stack:** TypeScript, Express, socket.io, redbean-node (`R`) and knex migrations, Vue 3 Options API, bootstrap-vue-next, `node:test` with tsx.

**Spec:** [docs/superpowers/specs/2026-11-11-github-webhook-deploy-design.md](../specs/2026-11-11-github-webhook-deploy-design.md)

## Global Constraints

- Node >= 22.14.0. Use only built-in `crypto`; add no new dependencies.
- 4-space indentation, JSDoc on every function and method, camelCase in TS, snake_case in SQL, kebab-case in CSS.
- UI strings only in `frontend/src/lang/en.json`. Do not edit any other `frontend/src/lang/*.json`.
- Use the colour tokens from `frontend/src/styles/vars.scss`. No hard-coded colours.
- Token: 32 bytes from `crypto.randomBytes`, base64url-encoded (43 characters). Store only the `sha256` hex digest (64 characters).
- HTTP replies: `200 { ok: true, msg: "Updated", stack }`, `404 { ok: false, msg: "Not found" }`, `404 { ok: false, msg: "Stack not found" }`, `409 { ok: false, msg }`, `429 { ok: false, msg: "Too many requests" }`, `500 { ok: false, msg }`. Never include terminal output.
- Webhook rate limit: 30 per minute for the whole instance.
- `last_result` values: `success`, `failed`, `busy`.
- Never log a token. Log the stack name only.
- `npm run lint`, `npm run check-ts`, `npm run build:frontend` and `npm test` must all pass.

## Review Focus

1. **A stack name with path characters** (`../etc`, `A`, an empty string) passed to `createWebhook`: it must be refused with the same `[a-z0-9_-]+` rule stacks use, and must never create a row. The test is in Task 1.
2. **A token with odd characters or length** (`%2e%2e`, a 500-character string, an empty path segment): the endpoint must answer `404` "Not found" and never throw. The test is in Task 2.
3. **Deleting a stack through Docket** must delete its webhook. This needs Docker, so it can't be unit-tested in CI. The manual check is in Task 4.
4. **Two webhook calls at once on one stack** must give one `200` and one `409`, not two deploys. The manual check is in Task 4. The `409` mapping depends on the exact rejection string from `Terminal.exec`, which Task 2 pins in code.
5. **Regenerating while a deploy is running** must not crash the running request. Recording the result must update the row by `stack_name`, not by the old row `id`, and must ignore a missing row. Covered by Task 2's `recordWebhookResult` interface.

---

### Task 1: Webhook store and management events

**Files:**
- Create: `backend/migrations/2026-11-11-1200-webhook-table.ts`
- Create: `backend/webhook.ts`
- Create: `backend/agent-socket-handlers/webhook-socket-handler.ts`
- Modify: `backend/docket-server.ts:93-96` (add `new WebhookSocketHandler()` to `agentSocketHandlerList`)
- Modify: `backend/stack.ts:294-316` (`delete` calls `deleteWebhook(this.name)` after the folder is removed)
- Test: `test/webhook.test.ts`

**Interfaces:**
- Produces (in `backend/webhook.ts`):
  - `type WebhookResult = "success" | "failed" | "busy"`
  - `interface WebhookInfo { createdDate : string; lastTriggered : string | null; lastResult : WebhookResult | null }`
  - `hashWebhookToken(token : string) : string` returns the sha256 hex digest.
  - `isWebhookStackName(name : string) : boolean` is true for `/^[a-z0-9_-]+$/`, and false for `docket` and `dockge`.
  - `createWebhook(stackName : string) : Promise<string>` inserts or replaces the row for `stackName` (new hash, new `created_date`, null `last_triggered`/`last_result`) and returns the raw token.
  - `getWebhookInfo(stackName : string) : Promise<WebhookInfo | null>`
  - `deleteWebhook(stackName : string) : Promise<void>`, which is a no-op when there is no row.
  - `findWebhookStackName(token : string) : Promise<string | null>` looks up by `hashWebhookToken(token)`.
  - `recordWebhookResult(stackName : string, result : WebhookResult) : Promise<void>` updates `last_triggered` (UTC `YYYY-MM-DD HH:mm:ss` via `dayjs.utc()`, the same as `last_active`) and `last_result` with `WHERE stack_name = ?`. It is a no-op when there is no row.
- Produces (agent events; all call `checkLogin(socket)`, validate `stackName` as a string, and reply with `callbackResult`/`callbackError`):
  - `getWebhook(stackName, callback)` → `{ ok: true, webhook: WebhookInfo | null }`
  - `createWebhook(stackName, callback)` → `{ ok: true, token }`. It throws `ValidationError` unless `isWebhookStackName(stackName)` holds, and calls `Stack.getStack(server, stackName)` first, which throws "Stack not found".
  - `deleteWebhook(stackName, callback)` → `{ ok: true }`

- [ ] **Step 1: Write the failing tests in `test/webhook.test.ts`**

Use the pattern of `test/system-info.test.ts`: `startBackend()`, `setupUsers()`, log in as `OWNER`. Create a stack without Docker using `call(socket, "agent", "", "saveStack", "web", "services:\n  web:\n    image: nginx:alpine\n", "", true)`. Use the helper `agentCall = (s, ev, ...a) => call(s, "agent", "", ev, ...a)`.

```ts
it("refuses a logged-out client", async () => {
    const s = await connect(backend.url);
    for (const ev of [ "getWebhook", "createWebhook", "deleteWebhook" ]) {
        assert.notEqual((await agentCall(s, ev, "web")).ok, true);
    }
});
it("creates a webhook and never returns the token again", async () => {
    const res = await agentCall(socket, "createWebhook", "web");
    assert.equal(res.ok, true);
    assert.match(res.token, /^[A-Za-z0-9_-]{43}$/);
    const info = await agentCall(socket, "getWebhook", "web");
    assert.equal(info.ok, true);
    assert.ok(info.webhook.createdDate);
    assert.equal(info.webhook.lastTriggered, null);
    assert.equal(JSON.stringify(info).includes(res.token), false);
    assert.equal("tokenHash" in info.webhook || "token_hash" in info.webhook, false);
});
it("returns null for a stack without a webhook", async () => {
    // create stack "plain" via saveStack first
    assert.equal((await agentCall(socket, "getWebhook", "plain")).webhook, null);
});
it("refuses missing stacks, Docket's own stack and bad names", async () => {
    for (const name of [ "missing", "docket", "dockge", "../etc", "A", "" ]) {
        assert.notEqual((await agentCall(socket, "createWebhook", name)).ok, true, name);
    }
});
it("deletes a webhook", async () => {
    await agentCall(socket, "createWebhook", "web");
    assert.equal((await agentCall(socket, "deleteWebhook", "web")).ok, true);
    assert.equal((await agentCall(socket, "getWebhook", "web")).webhook, null);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --import tsx --test test/webhook.test.ts`
Expected: FAIL. The `createWebhook` assertions fail because the event doesn't exist yet, so the proxy times out or returns an error.

- [ ] **Step 3: Write the migration**

Copy the shape of `2026-11-10-1200-user-last-active.ts`. `up` runs `createTable("webhook", ...)` with the columns in the spec's Database table: `increments("id")`; `string("stack_name", 255).notNullable().unique()`; `string("token_hash", 64).notNullable().unique()`; `datetime("created_date").notNullable().defaultTo(knex.fn.now())`; `datetime("last_triggered").nullable()`; `string("last_result", 20).nullable()`. `down` drops the table.

- [ ] **Step 4: Implement `backend/webhook.ts`**

Implement the interfaces listed above. Write `createWebhook` as delete-then-insert by `stack_name` with `R.exec`/`R.dispense`/`R.store`. Map snake_case columns to the camelCase `WebhookInfo`.

- [ ] **Step 5: Implement `WebhookSocketHandler` and register it**

`class WebhookSocketHandler extends AgentSocketHandler`, following `docker-socket-handler.ts`. Add it to `agentSocketHandlerList` in `backend/docket-server.ts`.

- [ ] **Step 6: Clean up on stack delete**

In `Stack.delete`, after `fsAsync.rm(...)`, call `await deleteWebhook(this.name)` inside its own try/catch that logs `log.warn("webhook", ...)`, so a DB error can't fail an otherwise finished delete.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `node --import tsx --test test/webhook.test.ts`
Expected: PASS, every test.

- [ ] **Step 8: Lint, type-check and commit**

Run: `npm run lint && npm run check-ts`. Expected: no errors.

```bash
git add backend/migrations/2026-11-11-1200-webhook-table.ts backend/webhook.ts backend/agent-socket-handlers/webhook-socket-handler.ts backend/docket-server.ts backend/stack.ts test/webhook.test.ts
git commit -m "Add per-stack deploy webhooks: table and management events"
```

---

### Task 2: The webhook HTTP endpoint

**Files:**
- Create: `backend/routers/webhook-router.ts`
- Modify: `backend/docket-server.ts:74-76` (add `new WebhookRouter()` to `routerList`)
- Modify: `backend/rate-limiter.ts` (add `webhookRateLimiter`)
- Modify: `backend/stack.ts:617-618` (`update(socket : DocketSocket | undefined)`, with terminal name `getComposeTerminalName(socket?.endpoint ?? "", this.name)`)
- Modify: `backend/terminal.ts:228` (export the rejection text as `export const TERMINAL_BUSY_MESSAGE = "Another operation is already running, please try again later."` and use it there)
- Test: `test/webhook.test.ts` (extend), `test/webhook-rate-limit.test.ts` (new)

**Interfaces:**
- Consumes: `findWebhookStackName`, `recordWebhookResult`, `createWebhook` from Task 1; `Stack.getStack`; `Stack.update`.
- Produces: `class WebhookRouter extends Router` serving `POST /api/webhook/:token`; `export const webhookRateLimiter = new KumaRateLimiter({ tokensPerInterval: 30, interval: "minute", fireImmediately: true, errorMessage: "Too many requests" })`.

- [ ] **Step 1: Write the failing HTTP tests (append to `test/webhook.test.ts`)**

Use a helper `hook = (token, method = "POST") => fetch(`${backend.url}/api/webhook/${token}`, { method })`.

```ts
it("answers 404 for an unknown or odd token", async () => {
    for (const t of [ "nope", "%2e%2e", "x".repeat(500) ]) {
        const r = await hook(t);
        assert.equal(r.status, 404, t);
        assert.deepEqual(await r.json(), { ok: false, msg: "Not found" });
    }
});
it("only accepts POST", async () => {
    const { token } = await agentCall(socket, "createWebhook", "web");
    assert.equal((await hook(token, "GET")).status, 404);
});
it("answers Stack not found when the folder is gone", async () => {
    // saveStack "gone", createWebhook "gone", then
    // fs.promises.rm(path.join(backend.dataDir, "stacks", "gone"), { recursive: true })
    const r = await hook(token);
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { ok: false, msg: "Stack not found" });
});
it("old token stops working after regenerate, new one after delete", async () => {
    const a = (await agentCall(socket, "createWebhook", "web")).token;
    const b = (await agentCall(socket, "createWebhook", "web")).token;
    assert.equal((await (await hook(a)).json()).msg, "Not found");
    await agentCall(socket, "deleteWebhook", "web");
    assert.equal((await (await hook(b)).json()).msg, "Not found");
});
```

Write `test/webhook-rate-limit.test.ts` (its own backend, so the limit doesn't touch the other tests):

```ts
it("answers 429 after 30 requests in a minute", async () => {
    const statuses = [];
    for (let i = 0; i < 31; i++) {
        statuses.push((await fetch(`${backend.url}/api/webhook/nope`, { method: "POST" })).status);
    }
    assert.deepEqual(statuses.slice(0, 30), Array(30).fill(404));
    assert.equal(statuses[30], 429);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --import tsx --test test/webhook.test.ts test/webhook-rate-limit.test.ts`
Expected: FAIL. The new tests get the SPA's HTML or a 404 page instead of the JSON bodies.

- [ ] **Step 3: Make `Stack.update` accept no socket, and export `TERMINAL_BUSY_MESSAGE`**

Make the edits listed under Files. The existing `updateStack` handler still passes its socket.

- [ ] **Step 4: Implement `WebhookRouter`**

Follow the order in the spec's "Request handling" section exactly:
1. `webhookRateLimiter.removeTokens(1)`; a result below 0 returns `429`.
2. `findWebhookStackName`; `null` returns `404` "Not found".
3. `Stack.getStack`; a `ValidationError` returns `404` "Stack not found".
4. `await stack.update(undefined)`.
5. Map the outcome: success → `200` and `recordWebhookResult(name, "success")`; an error whose message (or rejected string) equals `TERMINAL_BUSY_MESSAGE` → `409` and `"busy"`; anything else → `500` with `msg` set to the error message and `"failed"`.
6. `log.info("webhook", ...)` with the stack name and result, then `server.sendStackList()`.

Wrap everything in try/catch so that no input can produce an unhandled rejection or an HTML error page. Register the router in `routerList` (it runs before the static middleware).

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS, the whole suite.

- [ ] **Step 6: Lint, type-check and commit**

Run: `npm run lint && npm run check-ts`. Expected: no errors.

```bash
git add backend/routers/webhook-router.ts backend/docket-server.ts backend/rate-limiter.ts backend/stack.ts backend/terminal.ts test/webhook.test.ts test/webhook-rate-limit.test.ts
git commit -m "Add POST /api/webhook/:token to update a stack from CI"
```

---

### Task 3: Webhook drawer on the stack page

**Files:**
- Create: `frontend/src/components/WebhookDrawer.vue`
- Modify: `frontend/src/pages/Compose.vue:74-82` (add a menu item), plus the drawer element next to the other drawers (~line 430), plus the `data`/`methods` to open it
- Modify: `frontend/src/lang/en.json`
- Modify: `frontend/components.d.ts` only if the Vite plugin regenerates it

**Interfaces:**
- Consumes: the agent events from Task 1 through `this.$root.emitAgent(endpoint, event, stackName, callback)`.
- Produces: `WebhookDrawer` with props `open : Boolean`, `stackName : String`, `endpoint : String`; emits `close`.

- [ ] **Step 1: Add the strings to `en.json`**

Use these keys: `webhook` "Webhook"; `webhookIntro` "Call this URL from a GitHub Actions step (or anything else) to pull the stack's images and recreate it if it is running."; `createWebhook` "Create webhook"; `webhookUrl` "Webhook URL"; `webhookCopyNow` "Copy it now. It won't be shown again."; `webhookGithubStep` "GitHub Actions step"; `webhookGithubHint` "Save the URL as the repository secret DOCKET_WEBHOOK_URL."; `webhookCreated` "Created"; `webhookLastTriggered` "Last triggered"; `webhookLastResult` "Last result"; `webhookNever` "Never"; `webhookResultSuccess` "Success"; `webhookResultFailed` "Failed"; `webhookResultBusy` "Busy"; `regenerateWebhook` "Regenerate URL"; `deleteWebhook` "Delete webhook"; `regenerateWebhookConfirm` "The current URL will stop working. Continue?"; `deleteWebhookConfirm` "Delete this webhook? The URL will stop working."; `Copy`/`Copied` (reuse them if they already exist).

- [ ] **Step 2: Build `WebhookDrawer.vue`**

Model it on `VolumeDrawer.vue`: the same props/emits style, a `Teleport` to `body`, and the shared `drawer.scss`.
- On open, call `getWebhook`. An error or no reply within 5 s sets `unsupported` and shows only a short "not supported by this agent" line, using the existing generic error string if there is one, or otherwise adding `webhookUnsupported` "This agent's Docket version doesn't support webhooks.".
- Keep `token` in component data only, and clear it on close.
- Build the URL as `base + "/api/webhook/" + token`, where `base` is `location.origin` when `endpoint === ""`, and otherwise `$root.agentList[endpoint].url` with trailing slashes removed.
- Copy with `navigator.clipboard.writeText`.
- Use the existing `Confirm.vue` for the regenerate and delete confirmations.
- Show `lastResult` as a `status-badge`.
- Show this snippet text exactly:

  ```yaml
  - name: Redeploy on Docket
    run: curl -fsS -X POST --max-time 600 "${{ secrets.DOCKET_WEBHOOK_URL }}"
  ```

- [ ] **Step 3: Wire it into `Compose.vue`**

Add a `BDropdownItem` "Webhook" to the more menu, in view mode only. Add `webhookDrawer: { open: false }` to the data. Render `<WebhookDrawer :open="webhookDrawer.open" :stack-name="stack.name" :endpoint="endpoint" @close="webhookDrawer.open = false" />`.

- [ ] **Step 4: Verify the build**

Run: `npm run lint && npm run check-ts && npm run build:frontend`
Expected: all three succeed. Commit `frontend/components.d.ts` if it changed.

- [ ] **Step 5: Check it in the app**

Start the dev servers with the macOS command in CLAUDE.md. Open a stack, then ⋮ → Webhook → Create.
Expected:
- The URL and the snippet show and copy.
- Closing and reopening shows "Exists" with Last triggered "Never".
- `curl -X POST <url>` returns JSON, and after reopening the drawer the last result has changed.
- Regenerate makes the old URL return `404`, and Delete returns the drawer to its empty state.
- Check light and dark themes, and a narrow window.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/WebhookDrawer.vue frontend/src/pages/Compose.vue frontend/src/lang/en.json frontend/components.d.ts
git commit -m "Add webhook drawer to the stack page"
```

---

### Task 4: Docs and end-to-end check with Docker

**Files:**
- Modify: `README.md` (add a "Deploy from GitHub Actions" section)
- Modify: `CLAUDE.md` (a paragraph under Architecture)

- [ ] **Step 1: Write the README section**

Cover these points, in this order:
1. Create the webhook: stack page → ⋮ → Webhook.
2. Store the URL as the repository secret `DOCKET_WEBHOOK_URL`.
3. The workflow step (the snippet from Task 3).
4. What it does: pull, and recreate only if the stack is running.
5. Response codes `200`/`404`/`409`/`429`/`500`.
6. Raise the reverse proxy read timeout for long pulls.

- [ ] **Step 2: Write the CLAUDE.md paragraph**

A "Deploy webhooks" paragraph covering:
- `WebhookRouter` (`POST /api/webhook/:token`, the only HTTP API, rate-limited to 30/min);
- the `webhook` table, which holds only token hashes;
- `backend/webhook.ts`;
- the `getWebhook`/`createWebhook`/`deleteWebhook` agent events;
- `WebhookDrawer.vue`;
- that `Stack.delete` removes the row.

- [ ] **Step 3: Run the manual end-to-end check (needs Docker)**

With the dev servers running, create a stack `hooktest` using `image: nginx:alpine` and start it. Create its webhook, then check:
- `curl -sS -X POST <url>` returns `200` `{"ok":true,"msg":"Updated","stack":"hooktest"}`.
- Run two requests in parallel: `curl ... & curl ... & wait`. Expect one `200` and one `409`.
- Stop the stack and `curl` again. Expect `200`, with the stack still stopped in the UI.
- Delete the stack in the UI, then `curl` the old URL. Expect `404` "Not found", which proves the row was removed.
- Confirm the server log shows the stack name and never the token.

- [ ] **Step 4: Run the full CI set and commit**

Run: `npm run lint && npm run check-ts && npm run build:frontend && npm test`
Expected: all pass.

```bash
git add README.md CLAUDE.md
git commit -m "Document deploy webhooks"
```
