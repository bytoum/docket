# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dockge is a self-hosted web UI for managing `docker compose` stacks. It has a TypeScript backend (Express + socket.io, run directly with `tsx`, no compile step) and a Vue 3 + Vite frontend. Both share one `package.json`. Node >= 22.14.0.

## Commands

```bash
npm install
npm run dev              # frontend (vite, :5000) + backend (tsx watch, :5001) together
npm run dev:frontend     # vite dev server only, port 5000
npm run dev:backend      # backend only, port 5001 (tsx watch --inspect)
npm run lint             # eslint on **/*.{ts,vue}
npm run fmt              # eslint --fix
npm run check-ts         # tsc --noEmit
npm run build:frontend   # builds into ./frontend-dist (served by the backend in production)
npm run start            # run backend in production mode (needs frontend-dist built)
npm run reset-password   # CLI password reset (extra/reset-password.ts)
```

There is no test suite. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `lint`, `check-ts` and `build:frontend` on Linux, Windows and macOS. All three must pass.

The backend needs a working `docker` CLI with `docker compose`, because it shells out to it. Runtime config comes from CLI args or env vars: `DOCKGE_STACKS_DIR` (default `/opt/stacks`), `DOCKGE_DATA_DIR` (default `./data/`), `DOCKGE_PORT`, `DOCKGE_HOSTNAME`, `DOCKGE_SSL_KEY`/`DOCKGE_SSL_CERT`, and `DOCKGE_ENABLE_CONSOLE`.

### Local dev gotchas (macOS)
- **npm 12+ blocks install scripts.** The `allowScripts` entry in `package.json` lets the two native modules (`@louislam/sqlite3`, `@homebridge/node-pty-prebuilt-multiarch`) build. If the backend fails with `Cannot find module .../node_sqlite3.node`, run `npm rebuild @louislam/sqlite3 @homebridge/node-pty-prebuilt-multiarch`.
- **Use Node 22, not newer.** node-pty 0.11.14 has no prebuilt binary for Node 26 and fails to compile against it. Rebuild native modules and run the servers under the same Node 22 version.
- **macOS AirPlay Receiver uses port 5000**, so Vite falls back to 5001 and collides with the backend. Run the frontend on another port. In dev, the frontend always connects to the backend at `<host>:5001`, so keep the backend on 5001.
- **`/opt/stacks` isn't writable without root.** Set `DOCKGE_STACKS_DIR` to the repo's git-ignored `stacks/` folder.

```bash
PATH=~/.nvm/versions/node/v22.12.0/bin:$PATH DOCKGE_STACKS_DIR=$PWD/stacks \
  npx concurrently -k -r "npm run dev:backend" "npm run dev:frontend -- --port 5173 --strictPort"
```

## Architecture

### Almost everything goes over socket.io
Express only serves the built frontend ([backend/routers/main-router.ts](backend/routers/main-router.ts)). All app actions (login, stack CRUD, terminals, settings) are socket.io events. Handlers reply through a callback, using `callbackResult` / `callbackError` from [backend/util-server.ts](backend/util-server.ts). Each handler calls `checkLogin(socket)` first. Responses with `msgi18n: true` mean `msg` is a translation key.

[backend/dockge-server.ts](backend/dockge-server.ts) (`DockgeServer`) is the composition root. It parses config, sets up the DB, Express and socket.io, registers handlers on each connection, and runs a Cron job every 10s that pushes the stack list (`sendStackList`).

### Two kinds of socket handlers (multi-agent design)
A Dockge instance can manage other Dockge instances ("agents") on other Docker hosts. That is why handlers come in two kinds:

- **`SocketHandler`** ([backend/socket-handler.ts](backend/socket-handler.ts), implementations in [backend/socket-handlers/](backend/socket-handlers/)): local-only events such as auth, settings and agent management. They are registered with `socket.on(...)`.
- **`AgentSocketHandler`** ([backend/agent-socket-handler.ts](backend/agent-socket-handler.ts), implementations in [backend/agent-socket-handlers/](backend/agent-socket-handlers/)): events that act on a Docker host, such as stack deploy/stop/delete and terminals. They are registered with `agentSocket.on(...)` on an `AgentSocket` ([common/agent-socket.ts](common/agent-socket.ts)), which is a plain event map and **not** a real socket.

The frontend sends host-level events as `socket.emit("agent", endpoint, eventName, ...args)` (`emitAgent` in [frontend/src/mixins/socket.ts](frontend/src/mixins/socket.ts)). [backend/socket-handlers/agent-proxy-socket-handler.ts](backend/socket-handlers/agent-proxy-socket-handler.ts) routes each one:
- an empty or matching endpoint dispatches to the local `AgentSocket`;
- `ALL_ENDPOINTS` broadcasts to every agent;
- any other endpoint is forwarded through [backend/agent-manager.ts](backend/agent-manager.ts). There is one `AgentManager` per browser connection, and it keeps socket.io **client** connections to the remote Dockge instances.

Replies to the browser come back wrapped as `"agent"` events (`socket.emitAgent`). The frontend unwraps them into its own `AgentSocket`. When you add a Docker/host-level feature, put it in an `AgentSocketHandler` and call it with `emitAgent` so it works for remote agents too.

### Stacks are files on disk
[backend/stack.ts](backend/stack.ts) models a stack as a directory under the stacks dir that holds `compose.yaml` (or another accepted compose filename) and an optional `.env`. Dockge does not store stacks in its DB. It reads and writes these files, and it gets status by running `docker compose ls/ps --format json`. Long-running compose commands (up/down/pull) run in a PTY through [backend/terminal.ts](backend/terminal.ts) (`node-pty`), and their output streams to the browser as `terminalWrite` events.

### Database
[backend/database.ts](backend/database.ts) uses `redbean-node` (`R`) on top of knex. SQLite is the default (`data/dockge.db`), and MySQL is possible via `data/db-config.json`. Migrations are knex migrations in [backend/migrations/](backend/migrations/), named `YYYY-MM-DD-HHMM-description.ts`, and they run automatically at startup (`Database.patch()`). The DB only holds users, settings and agents.

### Frontend
Vue 3 with the Options API, using mixins. [frontend/src/mixins/socket.ts](frontend/src/mixins/socket.ts) holds the global socket connection and shared state (stack list, agent list and status, terminals). It is mixed into the root app, and components reach it via `this.$root`. Bootstrap 5 / bootstrap-vue-next components are auto-imported (see `frontend/components.d.ts`). `common/` is imported by both backend and frontend.

## Conventions (from CONTRIBUTING.md)

- 4-space indentation; follow `.editorconfig` and ESLint. Document functions and methods with JSDoc.
- Naming: camelCase in TS/JS, snake_case in SQLite, kebab-case in CSS/SCSS.
- Prefer settings configurable in the UI over new env vars (env vars only for startup concerns like `DOCKGE_STACKS_DIR`). No native build dependencies.
- Dependencies: backend runtime deps go in `dependencies`. Frontend deps (they get bundled) and tooling go in `devDependencies`.
- i18n: add new UI strings only to [frontend/src/lang/en.json](frontend/src/lang/en.json) and use them via `$t("...")`. **Do not edit other `frontend/src/lang/*.json` files.** A CI workflow blocks those changes, because translations come in through Weblate.
- No breaking changes. Keep diffs small and focused. Large features need a maintainer discussion first.
