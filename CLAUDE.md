# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Docket is a self-hosted web UI for managing `docker compose` stacks. It is a fork of [Dockge](https://github.com/louislam/dockge), rebranded as Docket; see "Naming" below for the few Dockge names that remain. It has a TypeScript backend (Express + socket.io, run directly with `tsx`, no compile step) and a Vue 3 + Vite frontend. Both share one `package.json`. Node >= 22.14.0.

## Commands

```bash
npm install
npm run dev              # frontend (vite, :5000) + backend (tsx watch, :5001) together
npm run dev:frontend     # vite dev server only, port 5000
npm run dev:backend      # backend only, port 5001 (tsx watch --inspect)
npm run lint             # eslint on **/*.{ts,vue}
npm run fmt              # eslint --fix
npm run check-ts         # tsc --noEmit
npm test                 # backend tests (node:test + tsx, starts a throwaway backend)
npm run build:frontend   # builds into ./frontend-dist (served by the backend in production)
npm run start            # run backend in production mode (needs frontend-dist built)
npm run reset-password   # CLI password reset (extra/reset-password.ts)
```

Tests live in `test/` and run with `npm test` (Node's `node:test` through `tsx`, no extra framework). Each test file starts a real backend in a child process on a free port, with temporary data and stacks folders, and talks to it over socket.io the way the browser does; [test/helpers/backend.ts](test/helpers/backend.ts) has the helpers (`startBackend`, `connect`, `call`, `codeFor`, `setupUsers`). Login (20/min) and 2FA (30/min) rate limits apply per backend, so split a test file rather than loosen them. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `lint`, `check-ts`, `build:frontend` and `test` on Linux, Windows and macOS. All four must pass.

Releases: bump `version` in `package.json` and push it to `main`. Then publish a GitHub release with a matching tag, either from Releases → "Draft a new release" or with `gh release create 1.6.0 --generate-notes`. [.github/workflows/release.yml](.github/workflows/release.yml) builds amd64 and arm64 on native runners and pushes `bytoum/docket` to Docker Hub with the tags `1.6.0`, `1.6`, `1` and `latest`. A release marked as a pre-release, or a version like `1.6.0-beta.0`, gets only its own tag. Running the workflow by hand tags the image with the branch name. It uses the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets.

The backend needs a working `docker` CLI with `docker compose`, because it shells out to it. Runtime config comes from CLI args or env vars: `DOCKET_STACKS_DIR` (default `/opt/stacks`), `DOCKET_DATA_DIR` (default `./data/`), `DOCKET_PORT`, `DOCKET_HOSTNAME`, `DOCKET_SSL_KEY`/`DOCKET_SSL_CERT`, `DOCKET_ENABLE_CONSOLE`, and `DOCKET_SESSION_EXPIRY` (login session lifetime such as `12h` or `7d`, default `1d`, or `never`).

### Local dev gotchas (macOS)
- **npm 12+ blocks install scripts.** The `allowScripts` entry in `package.json` lets the two native modules (`@louislam/sqlite3`, `@homebridge/node-pty-prebuilt-multiarch`) build. If the backend fails with `Cannot find module .../node_sqlite3.node`, run `npm rebuild @louislam/sqlite3 @homebridge/node-pty-prebuilt-multiarch`.
- **Use Node 22, not newer.** node-pty 0.11.14 has no prebuilt binary for Node 26 and fails to compile against it. Rebuild native modules and run the servers under the same Node 22 version.
- **macOS AirPlay Receiver uses port 5000**, so Vite falls back to 5001 and collides with the backend. Run the frontend on another port. In dev, the frontend always connects to the backend at `<host>:5001`, so keep the backend on 5001.
- **`/opt/stacks` isn't writable without root.** Set `DOCKET_STACKS_DIR` to the repo's git-ignored `stacks/` folder.

```bash
PATH=~/.nvm/versions/node/v22.12.0/bin:$PATH DOCKET_STACKS_DIR=$PWD/stacks \
  npx concurrently -k -r "npm run dev:backend" "npm run dev:frontend -- --port 5173 --strictPort"
```

## Architecture

### Almost everything goes over socket.io
Express only serves the built frontend ([backend/routers/main-router.ts](backend/routers/main-router.ts)). All app actions (login, stack CRUD, terminals, settings) are socket.io events. Handlers reply through a callback, using `callbackResult` / `callbackError` from [backend/util-server.ts](backend/util-server.ts). Each handler calls `checkLogin(socket)` first. Responses with `msgi18n: true` mean `msg` is a translation key.

[backend/docket-server.ts](backend/docket-server.ts) (`DocketServer`) is the composition root. It parses config, sets up the DB, Express and socket.io, registers handlers on each connection, and runs a Cron job every 10s that pushes the stack list (`sendStackList`).

### Two kinds of socket handlers (multi-agent design)
A Docket instance can manage other Docket (or Dockge) instances ("agents") on other Docker hosts. That is why handlers come in two kinds:

- **`SocketHandler`** ([backend/socket-handler.ts](backend/socket-handler.ts), implementations in [backend/socket-handlers/](backend/socket-handlers/)): local-only events such as auth, settings and agent management. They are registered with `socket.on(...)`.
- **`AgentSocketHandler`** ([backend/agent-socket-handler.ts](backend/agent-socket-handler.ts), implementations in [backend/agent-socket-handlers/](backend/agent-socket-handlers/)): events that act on a Docker host, such as stack deploy/stop/delete and terminals. They are registered with `agentSocket.on(...)` on an `AgentSocket` ([common/agent-socket.ts](common/agent-socket.ts)), which is a plain event map and **not** a real socket.

The frontend sends host-level events as `socket.emit("agent", endpoint, eventName, ...args)` (`emitAgent` in [frontend/src/mixins/socket.ts](frontend/src/mixins/socket.ts)). [backend/socket-handlers/agent-proxy-socket-handler.ts](backend/socket-handlers/agent-proxy-socket-handler.ts) routes each one:
- an empty or matching endpoint dispatches to the local `AgentSocket`;
- `ALL_ENDPOINTS` broadcasts to every agent;
- any other endpoint is forwarded through [backend/agent-manager.ts](backend/agent-manager.ts). There is one `AgentManager` per browser connection, and it keeps socket.io **client** connections to the remote instances.

Replies to the browser come back wrapped as `"agent"` events (`socket.emitAgent`). The frontend unwraps them into its own `AgentSocket`. When you add a Docker/host-level feature, put it in an `AgentSocketHandler` and call it with `emitAgent` so it works for remote agents too.

### Stacks are files on disk
[backend/stack.ts](backend/stack.ts) models a stack as a directory under the stacks dir that holds `compose.yaml` (or another accepted compose filename) and an optional `.env`. Docket does not store stacks in its DB. It reads and writes these files, and it gets status by running `docker compose ls/ps --format json`. Long-running compose commands (up/down/pull) run in a PTY through [backend/terminal.ts](backend/terminal.ts) (`node-pty`), and their output streams to the browser as `terminalWrite` events.

### Database
[backend/database.ts](backend/database.ts) uses `redbean-node` (`R`) on top of knex. SQLite is the default (`data/docket.db`; an older `data/dockge.db` is renamed to it on startup), and MySQL is possible via `data/db-config.json`. Migrations are knex migrations in [backend/migrations/](backend/migrations/), named `YYYY-MM-DD-HHMM-description.ts`, and they run automatically at startup (`Database.patch()`). The DB only holds users, settings and agents.

### Two-factor authentication
TOTP, using the `otpauth` package in [backend/two-fa.ts](backend/two-fa.ts) (6 digits, 30s, window 1; `clearTwoFA(userID)` wipes a user's 2FA). Users manage their own 2FA through the local-only events in [backend/socket-handlers/two-fa-socket-handler.ts](backend/socket-handlers/two-fa-socket-handler.ts), and the ones that change it require the current password. The `login` handler replies `tokenRequired`, rejects a reused code (`twofa_last_token`) and is rate limited. The owner can reset another user's 2FA (`resetUser2FA` in `user-socket-handler.ts`) or password (`resetUserPassword`, which logs that user out everywhere), and `npm run reset-password` offers to turn it off. Agent connections cannot use 2FA, so `AgentManager` reports `agentTwoFAError` when a remote account has it on.

### Frontend
Vue 3 with the Options API, using mixins. [frontend/src/mixins/socket.ts](frontend/src/mixins/socket.ts) holds the global socket connection and shared state (stack list, agent list and status, terminals). It is mixed into the root app, and components reach it via `this.$root`. Bootstrap 5 / bootstrap-vue-next components are auto-imported (see `frontend/components.d.ts`, which the Vite plugin regenerates; commit it when components are added or removed). `common/` is imported by both backend and frontend.

### Stack page and drawers
[frontend/src/pages/Compose.vue](frontend/src/pages/Compose.vue) is the stack page (view, edit and new-stack modes). It keeps the parsed compose file in `jsonConfig`; a deep watcher writes it back to `compose.yaml`, keeping comments. The visual editors are side drawers that emit a result, and Compose applies it to `jsonConfig`. In view mode, Compose then deploys right away (`deployIfViewing()`); in edit mode the change only lands in the editor.

- [ContainerDrawer.vue](frontend/src/components/ContainerDrawer.vue): add or edit a service (name, image, ports, volumes, restart policy, networks as switches, dependencies, URLs). It does not touch `environment` or `env_file`, and it keeps settings it does not show.
- [EnvDrawer.vue](frontend/src/components/EnvDrawer.vue) and [EnvEditor.vue](frontend/src/components/EnvEditor.vue): a service's `environment`, as a key/value list or a raw `KEY=value` CodeMirror editor. The drawer's width can be resized.
- [NetworkDrawer.vue](frontend/src/components/NetworkDrawer.vue) and [VolumeDrawer.vue](frontend/src/components/VolumeDrawer.vue): a top-level network or volume, either new or external (picked from the host). Rename and delete also update the services that use it.
- Delete buttons are on the container cards and the network/volume rows, not in the drawers.
- Shared drawer styles are in [frontend/src/styles/drawer.scss](frontend/src/styles/drawer.scss). Drawers teleport to `body`, so a drawer later in the template stacks on top.

Host lookups for the drawers are agent events in [backend/agent-socket-handlers/docker-socket-handler.ts](backend/agent-socket-handlers/docker-socket-handler.ts): `getDockerNetworkDetails` and `getDockerVolumeDetails`, each returning name, driver and container count. Older remote agents lack them, so the frontend treats a failed call as "no data".

[ConsoleDock.vue](frontend/src/components/ConsoleDock.vue) is the bottom log dock (`docker compose logs -f` through the combined terminal). It filters by container and by text, can be cleared and resized, and sets `--console-dock-height` so the page leaves room for it.

### Settings
[frontend/src/pages/Settings.vue](frontend/src/pages/Settings.vue) is the settings layout: a title and subtitle, an icon menu on the left, and a surface card on the right. The card has a header (page title, description and a divider) above the page body, which is the routed page from [frontend/src/components/settings/](frontend/src/components/settings/) (General, Appearance, Security, Users, Global .env, About). Users and Global .env are shown only to the owner; the server also sends `global.env` in `getSettings`, and accepts it in `setSettings`, only for the owner (`isOwner` in [backend/util-server.ts](backend/util-server.ts)). A page can put buttons in the card header by teleporting them to `#settings-header-actions` (Users does this for "Add user"). Shared classes (`settings-section`, `settings-divider`, `settings-field`, `settings-row`, `btn-subtle`, `btn-danger-subtle`, `status-badge`, `settings-segmented`) are in [frontend/src/styles/settings.scss](frontend/src/styles/settings.scss), which Settings.vue imports globally. The menu icons exported from Figma are in `frontend/src/assets/settings/`; they are used as CSS masks, so they take the text colour, and the URL must be quoted in `url("...")` because inlined SVGs contain single quotes. About gets the Docker version, Compose version, host and uptime from the `getSystemInfo` socket event ([backend/socket-handlers/main-socket-handler.ts](backend/socket-handlers/main-socket-handler.ts)); a field that cannot be read is `null` and shows as "Unavailable" (the fields show "—" until the reply arrives). The Global .env List view is read-only unless the text round-trips exactly through the list (no comments, blank lines or unusual formatting), so saving from List never drops anything. Edit such a file in Raw.

### Design
The UI follows the "Dockge – Redesign" Figma file (https://www.figma.com/design/F38NzF6eFkGRgcsJUoHSaD/Dockge-%E2%80%93-Redesign). Its variables (bg, border, text, accent, status) are defined in [frontend/src/styles/vars.scss](frontend/src/styles/vars.scss) with light and dark values. Use these tokens instead of hard-coded colours. The style is flat: 4px corners, filled inputs and no borders. Icons exported from Figma live in `frontend/src/assets/stack/` and `frontend/src/assets/drawer/`, and are shown with `AssetIcon`.

The logo is the "Logo" layer inside the top bar's "Brand" in Figma: a `#2563EB` square with 4px corners and a white "D" with a dot. [frontend/public/icon.svg](frontend/public/icon.svg) is that SVG. Every other icon is rendered from it:
- `icon-192x192.png` and `icon-512x512.png` (rounded corners, transparent background, used by `manifest.json`);
- `apple-touch-icon.png` (180px, square and opaque, because iOS rounds the corners itself);
- `favicon.ico` (16, 32 and 48px).

When the logo changes, regenerate all of them. In the top bar, the logo is 32px with a 10px gap, next to "Docket" in 20px bold.

## Naming

The product is called **Docket** in everything people see: the UI, `en.json` values, backend messages shown to users, docs, the npm package name (`docket`), the Docker image (`bytoum/docket`) and the GitHub repo (`bytoum/docket`, default branch `main`). `upstream` is the original `louislam/dockge`, whose default branch is still `master`.

Code, config and data use `docket` too: `DocketServer`, `DocketSocket`, `isManagedByDocket`, [backend/docket-server.ts](backend/docket-server.ts), the `docket` service and `/opt/docket` directory in the docs, `data/docket.db` and the `x-docket` compose key. Support links and the update check point to `bytoum/docket` (the check reads its GitHub releases).

The env vars are `DOCKET_*`. The old `DOCKGE_*` names are no longer read; the server logs a warning when one is still set.

Older names are still accepted where existing installs depend on them:
- `data/dockge.db` is renamed to `data/docket.db` on startup ([backend/database.ts](backend/database.ts)), unless `docket.db` already exists.
- `x-dockge` is still read and is moved to `x-docket` when the stack URLs are saved (`getComposeExtension` in [common/util-common.ts](common/util-common.ts)).
- `backend/stack.ts` hides Docket's own stack under the project name `docket` or `dockge`.
- Stack lists carry both `isManagedByDocket` and `isManagedByDockge`, and the frontend accepts either (`normalizeStack`), so mixed-version agents work.

These still say `dockge` on purpose:
- i18n keys (`dockgeAgent`, `dockgeURL`, `stackNotManagedByDockgeMsg`): renaming them would orphan the Weblate translations; their English text says Docket.
- the `louislam/dockge:base` base image in the Dockerfile (an external image);
- credits and translation links to `louislam/dockge`, and the Figma file name.

The healthcheck binary is built from [extra/healthcheck.go](extra/healthcheck.go) inside [docker/Dockerfile](docker/Dockerfile), because it has to read the `DOCKET_*` variables.

Other `frontend/src/lang/*.json` files still say "Dockge" and must not be edited here (they come from Weblate).

## Conventions (from CONTRIBUTING.md)

- 4-space indentation; follow `.editorconfig` and ESLint. Document functions and methods with JSDoc.
- Naming: camelCase in TS/JS, snake_case in SQLite, kebab-case in CSS/SCSS.
- Prefer settings configurable in the UI over new env vars (env vars only for startup concerns like `DOCKET_STACKS_DIR`). No native build dependencies.
- Dependencies: backend runtime deps go in `dependencies`. Frontend deps (they get bundled) and tooling go in `devDependencies`.
- i18n: add new UI strings only to [frontend/src/lang/en.json](frontend/src/lang/en.json) and use them via `$t("...")`. **Do not edit other `frontend/src/lang/*.json` files.** A CI workflow blocks those changes, because translations come in through Weblate.
- No breaking changes. Keep diffs small and focused. Large features need a maintainer discussion first.
