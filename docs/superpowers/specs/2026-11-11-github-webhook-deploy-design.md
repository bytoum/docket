# Deploy webhooks for GitHub Actions

Date: 2026-11-11
Status: approved design, awaiting spec review

## Goal

When a GitHub Actions workflow finishes (typically after building and pushing a new image), it calls a webhook on Docket, and Docket redeploys one stack with the new image. Docket never accesses the GitHub repository.

Success looks like this: one `curl` step at the end of a workflow redeploys the stack, and the step fails (red ❌ in GitHub) when the deploy fails.

## Decisions

| Topic | Decision |
|---|---|
| Scope | One secret webhook URL per stack. A leaked URL can only redeploy that stack. |
| Where it runs | Each Docket host serves webhooks for its own stacks. Webhooks for stacks on a remote agent are created through the agent and point at the agent's URL. |
| Action | The same as the existing Update button (`Stack.update`): `docker compose pull`, then `up -d --remove-orphans` only if the stack is running. A stopped stack is pulled but not started. |
| Response | Synchronous. The request waits for the deploy and returns its result. |
| Token storage | A new `webhook` table storing only the SHA-256 hash of the token. The URL is shown once, when it is created or regenerated. |
| Permissions | Any logged-in user can manage webhooks, the same as deploying a stack. |

## Webhook endpoint

A new Express router `WebhookRouter` (`backend/routers/webhook-router.ts`) is added to `DocketServer.routerList` next to `MainRouter`, so it is registered before the static frontend.

Route: `POST /api/webhook/:token`. It needs no body and no headers. Any other method returns `404`.

Request handling, in order:

1. **Rate limit.** A dedicated `KumaRateLimiter` for the whole instance allows 30 requests per minute. Over the limit, it returns `429` with `{ ok: false, msg: "Too many requests" }`.
2. **Token lookup.** Docket computes the SHA-256 hex digest of `:token` and runs `SELECT ... FROM webhook WHERE token_hash = ?`. No row returns `404` with `{ ok: false, msg: "Not found" }`. Because the lookup compares hashes, the timing of the comparison tells an attacker nothing about the raw token.
3. **Load the stack.** `Stack.getStack(server, row.stack_name)`. If the stack does not exist, it returns `404` with `{ ok: false, msg: "Stack not found" }`. Only a holder of a valid token can reach this message, so it reveals nothing.
4. **Deploy.** `await stack.update(undefined)`. `Terminal.exec` already accepts an undefined socket. The terminal name comes from `getComposeTerminalName("", stackName)`, which is the same as the local name, so the existing guard against concurrent operations covers the UI and webhooks together.
5. **Respond.**
   - On success: `200` with `{ ok: true, msg: "Updated", stack: "<name>" }`.
   - If another operation is already running on the stack (`Terminal.exec` rejects with "Another operation is already running…"): `409` with `{ ok: false, msg }`.
   - Any other failure: `500` with `{ ok: false, msg }`, where `msg` is the error message ("Failed to pull, please check the terminal output…").
   - The terminal output is never included, because GitHub Actions logs may be public.
6. **Record.** Docket sets `last_triggered = now` and `last_result` to `success`, `busy` or `failed` on the row. It logs `log.info("webhook", "Webhook triggered for stack <name>: <result>")` with the stack name only, never the token, and calls `server.sendStackList()`.

`Stack.update` needs a small change: today it builds the terminal name from `socket.endpoint`, which fails when the socket is undefined. It will use `socket?.endpoint ?? ""`.

### Token

A token is 32 bytes from `crypto.randomBytes`, encoded as base64url (43 characters). Only `sha256(token)` in hex is stored.

## Database

Migration `backend/migrations/2026-11-11-1200-webhook-table.ts` creates:

| column | type | notes |
|---|---|---|
| `id` | increments | primary key |
| `stack_name` | string(255), not null | unique |
| `token_hash` | string(64), not null | unique (indexed) |
| `created_date` | datetime, not null | default now |
| `last_triggered` | datetime | nullable |
| `last_result` | string(20) | nullable: `success`, `failed`, `busy` |

`Stack.delete` deletes the row for that stack after the stack is removed.

## Managing webhooks

A new `AgentSocketHandler` in `backend/agent-socket-handlers/webhook-socket-handler.ts` is registered with the other agent handlers, so it works for local stacks and for stacks on remote agents. Every event calls `checkLogin(socket)` and validates `stackName` as a string.

- `getWebhook(stackName, callback)` returns `{ ok: true, webhook: null }` or `{ ok: true, webhook: { createdDate, lastTriggered, lastResult } }`. It never returns the token or the hash.
- `createWebhook(stackName, callback)` creates the webhook or regenerates it (replacing the hash, so the old URL stops working at once). It returns `{ ok: true, token }`. The stack must exist, and Docket's own stack (project name `docket` or `dockge`) is refused.
- `deleteWebhook(stackName, callback)` deletes the row and returns `{ ok: true }`.

Older agents do not have these events. The frontend treats an error or a missing reply from `getWebhook` as "not supported" and hides the menu item.

## UI

On the stack page ([frontend/src/pages/Compose.vue](../../../frontend/src/pages/Compose.vue)), the existing "⋮" more menu gets a "Webhook" item, shown in view mode only, for existing stacks. It opens a new `frontend/src/components/WebhookDrawer.vue` that uses the shared drawer styles ([frontend/src/styles/drawer.scss](../../../frontend/src/styles/drawer.scss)).

The drawer has three states:

- **No webhook.** One or two sentences on what the webhook does (pull the new images and recreate the stack if it is running), and a "Create webhook" button.
- **Just created or regenerated.** The full URL in a read-only field with a Copy button, a warning ("Copy it now. It won't be shown again."), and a GitHub Actions step snippet with its own Copy button:

  ```yaml
  - name: Redeploy on Docket
    run: curl -fsS -X POST --max-time 600 "${{ secrets.DOCKET_WEBHOOK_URL }}"
  ```

- **Exists.** Created date, last triggered, and the last result as a `status-badge`, followed by "Regenerate URL" and "Delete webhook", each behind a confirmation.

The frontend builds the URL:

- for a local stack (empty endpoint): `location.origin + "/api/webhook/" + token`;
- for a remote agent: that agent's URL from `$root.agentList` (trailing slash removed) + `"/api/webhook/" + token`.

All new strings go only in `frontend/src/lang/en.json`.

## Edge cases

- **A stack is deleted through Docket.** Its webhook row is deleted.
- **A stack folder is removed some other way.** The webhook returns `404` "Stack not found" until the webhook is deleted.
- **A stack is created again under the same name.** It has no webhook, because the old row was deleted with the stack.
- **Long pulls.** There is no server-side timeout. The documented `curl` uses `--max-time 600`. A reverse proxy may need a longer read timeout, which the docs mention.
- **Docket's own stack.** It is refused in `createWebhook`, because redeploying Docket from inside itself would kill the request partway through.
- **Logging.** Tokens never appear in logs.

## Testing

`test/webhook.test.ts` uses the existing helpers in [test/helpers/backend.ts](../../../test/helpers/backend.ts) (`startBackend`, `connect`, `call`, `setupUsers`) and sends plain HTTP requests with `fetch`. CI has no Docker daemon, so no test runs Docker. The tests cover:

- `getWebhook`, `createWebhook` and `deleteWebhook` without logging in fail.
- `createWebhook` for a stack that exists (created in the temporary stacks folder) returns a 43-character token, and `getWebhook` then returns a webhook with no `token` or `token_hash` field.
- `createWebhook` for a stack that does not exist, and for `docket`, fails.
- `POST /api/webhook/<random>` returns `404` "Not found".
- `GET /api/webhook/<valid token>` returns `404`.
- After the stack folder is removed, `POST` with a valid token returns `404` "Stack not found".
- After regenerating, the old token returns `404` "Not found". After deleting, the newest token returns `404` "Not found".
- Requests over 30 per minute return `429`. This runs in its own test file if needed, so the limit doesn't affect the other tests.

Manual check with Docker: run Docket locally with a small stack (for example `nginx:alpine`), create the webhook, and `curl` it. Expect `200`, with the container recreated after an image change. Then fire two requests at once and expect one `200` and one `409`. Then stop the stack and expect `200`, with the image pulled and the stack still stopped.

## Docs

- README: a "Deploy from GitHub Actions" section covering creating the webhook, storing it as a `DOCKET_WEBHOOK_URL` repository secret, the workflow step, the response codes (`200`, `404`, `409`, `429`, `500`) and the proxy timeout note.
- CLAUDE.md: a short paragraph on `WebhookRouter`, the `webhook` table and the webhook agent events.

## Out of scope

- Fetching compose files from a GitHub repo.
- Verifying GitHub's `X-Hub-Signature-256` (this is a plain token URL called from a workflow, not a GitHub repository webhook).
- Choosing a different action per webhook (restart, start, deploy). Only Update is supported.
- Streaming output back to GitHub, or showing a webhook deploy's live output in an open Docket tab.
