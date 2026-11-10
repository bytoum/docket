# Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the six Settings pages match the Figma "2 · Settings" section, adding the Add user dialog, a Global .env List/Raw switch and About system info.

**Architecture:** `Settings.vue` becomes a header + icon menu + card layout that reads each page's title, description and icon from its `subMenus` entry. Shared styles live in `frontend/src/styles/settings.scss`. Each page component is restyled in place. One new local socket event, `getSystemInfo`, feeds About.

**Tech Stack:** Vue 3 Options API, Bootstrap 5 / bootstrap-vue-next, SCSS tokens from `vars.scss`, socket.io, `node:test` for the backend test.

**Spec:** `docs/superpowers/specs/2026-11-10-settings-redesign-design.md`

## Global Constraints

- Figma file key `F38NzF6eFkGRgcsJUoHSaD`. Frames: General `115:2246`, Users `138:2734`, Add user dialog `142:2754`, Appearance `147:2784`, Security `148:2796`, Global .env `148:2973`, About `148:3156`. Load the `figma:figma-design-to-code` skill before calling `get_design_context`. Call `create_session` once per working session before Figma reads.
- Colours only from `frontend/src/styles/vars.scss` tokens, with a `.dark` override using the `$dark-*` tokens for every coloured rule. Flat style: 4px radius, filled inputs, no borders.
- New UI strings only in `frontend/src/lang/en.json` (grep first, reuse existing keys). Never edit other lang files.
- No behaviour change to existing settings (save flows, socket events, owner gating, theme and language apply at once). The inline add-user form is removed; the dialog replaces it.
- Node 22: `PATH=~/.nvm/versions/node/v22.12.0/bin:$PATH`. Every task ends with `npm run lint` (0 errors), `npm run check-ts`, `npm run build:frontend` and `npm test` all passing.
- Run the app for checks: `PATH=... DOCKET_STACKS_DIR=$PWD/stacks npx concurrently -k -r "npm run dev:backend" "npm run dev:frontend -- --port 5173 --strictPort"`. The backend must be on 5001.
- If `frontend/components.d.ts` changes, commit it.
- 4-space indentation, JSDoc on new methods, kebab-case CSS classes.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Dark mode on every new surface** (badges, theme cards, segmented switch, danger buttons, card header divider): readable, with no light-only colours. Checked in Task 8's dark screenshots.
2. **Mobile width (≤ 768px):** the settings menu is still its own screen, the card fills the width, and Users rows wrap their buttons instead of overflowing. Checked in Task 8 at 375px.
3. **Global .env with comments:** editing in List never deletes `#` comments or blank lines. Pinned in Task 6's manual check, which saves a file with comments from Raw, opens List (read-only, with a note), and confirms Save leaves the comments.
4. **Add user dialog reopen:** after cancelling or adding, reopening shows an empty form and no stale error. Checked in Task 5.
5. **About without Docker** (the CI test backend, or a host where Docker is stopped): the rows show "Unavailable", with no error toast and no hang. Pinned in Task 1's test (fields are `string | null`) and Task 7's check.

---

### Task 1: `getSystemInfo` backend event

**Files:**
- Create: `test/system-info.test.ts`
- Modify: `backend/socket-handlers/main-socket-handler.ts` (new handler next to `composerize`)

**Interfaces:**
- Produces: socket event `getSystemInfo(callback)` → `{ ok: true, dockerVersion: string | null, composeVersion: string | null, host: string, uptimeSeconds: number }`. Logged out → `callbackError` (`ok: false`).

- [ ] **Step 1: Write the test** `test/system-info.test.ts`, using `startBackend`, `setupUsers`, `connect`, `call` and `closeAll` from `test/helpers/backend.ts`:
  - `"refuses a logged-out client"`: `ok !== true` and `host === undefined`.
  - `"returns host, uptime and Docker versions"` (after `login` as `OWNER`): `ok === true`; `typeof host === "string" && host.length > 0`; `Number.isInteger(uptimeSeconds) && uptimeSeconds >= 0`; each of `dockerVersion` and `composeVersion` is `null` or a non-empty string.
- [ ] **Step 2: Run** `npm test`. Expected: the 2 new tests fail with `No reply to "getSystemInfo"`.
- [ ] **Step 3: Implement** the handler. Use `checkLogin(socket)` first, then run both docker commands with `childProcessAsync.spawn` (import as in `docket-server.ts`; `encoding: "utf-8"`, `timeout: 5000`) inside a small local `async function commandOutput(cmd, args): Promise<string | null>` that trims stdout and returns `null` on any error or empty output. Run the two commands with `Promise.all`. `host` = `` `${os.type()} ${os.arch()}` ``; `uptimeSeconds` = `Math.floor(process.uptime())`. Reply with `callbackResult`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass (26 tests).
- [ ] **Step 5: Lint, check-ts and commit** "Add getSystemInfo for the About page".

---

### Task 2: Settings layout, shared styles, icons, General

**Files:**
- Create: `frontend/src/styles/settings.scss`, and `frontend/src/assets/settings/{general,appearance,security,users,global-env,about}.svg`
- Modify: `frontend/src/pages/Settings.vue`, `frontend/src/components/settings/General.vue`, `frontend/src/lang/en.json`

**Interfaces:**
- Produces:
  - `subMenus[key]` = `{ title, description, icon }`, where `icon` is an imported SVG URL.
  - A named slot `header-actions` is not possible through `router-view`. Instead, `Settings.vue` renders the card header, and a page that needs header actions (Users) exposes them through a `Teleport` target `#settings-header-actions` that `Settings.vue` renders inside the card header.
  - SCSS classes from the spec: `.settings-section`, `.settings-field`, `.settings-row`, `.btn-subtle`, `.btn-danger-subtle`, `.status-badge` with `--accent`, `--success`, `--warning` and `--neutral`.
  - Pages import the shared styles with `@import "../../styles/settings.scss";` in a non-scoped `<style lang="scss">`, or `Settings.vue` imports them once globally. Pick one and use it for all pages.

- [ ] **Step 1: Read the design.** `get_design_context` on `115:2246`. Note the header, menu, card and field metrics.
- [ ] **Step 2: Export the menu icons.** Use the Figma asset download (`download_assets`, or the asset URLs from `get_design_context`) for the six "Settings Menu" icons, save them as the SVG files above, and set their stroke and fill to `currentColor` so the active colour applies.
- [ ] **Step 3: Implement** the `Settings.vue` layout, `settings.scss` and the General page per the spec ("Shared layout", "General"). Keep the mobile behaviour (`showSubMenu`) and the Logout item. Add the en.json keys `settingsSubtitle` and the six page descriptions, with the text from Figma.
- [ ] **Step 4: Check in the running app** at `/settings/general` (light and dark): the header, menu with icons and active state, card header with divider, and hostname row look like the frame; "Auto get" and Save still work. Other pages still render inside the new card, even if they're not restyled yet.
- [ ] **Step 5: Lint, check-ts, build, test and commit** "Redesign the settings layout and General page".

---

### Task 3: Appearance

**Files:** Modify `frontend/src/components/settings/Appearance.vue` and `en.json`.

- [ ] **Step 1:** `get_design_context` on `147:2784`.
- [ ] **Step 2: Implement** the theme cards (radio inputs bound to `$root.userTheme` with values `light`, `dark` and `auto`, matching the current values; check the existing template) with CSS previews, and the styled language select, per the spec. No Density, Reduce motion or Save button.
- [ ] **Step 3: Check in the app:** clicking each card switches the theme at once; arrow keys move the selection; language still switches; both look right in light and dark.
- [ ] **Step 4: Lint, check-ts, build, test and commit** "Redesign the Appearance settings".

---

### Task 4: Security

**Files:** Modify `frontend/src/components/settings/Security.vue`, `frontend/src/components/TwoFADialog.vue` (remove its duplicated `.status-badge` styles in favour of `settings.scss`; its look stays the same) and `en.json`.

- [ ] **Step 1:** `get_design_context` on `148:2796`.
- [ ] **Step 2: Implement** the password section, the 2FA row (badge Enabled = `--success`, Disabled = `--neutral`, **Manage** opens `TwoFADialog`, hidden when auth is disabled) and the Disable authentication row (`.btn-danger-subtle` with a trash icon, using the existing `confirmDisableAuth` flow; the Enable button when auth is off). The trash icon can reuse the Users delete icon exported in Task 5, or be exported now from this frame as `frontend/src/assets/settings/trash.svg`.
- [ ] **Step 3: Check in the app:** change password (success toast); Manage opens the dialog, and enabling 2FA updates the badge without a reload; Disable shows the existing confirm, and cancelling it changes nothing. Check light and dark.
- [ ] **Step 4: Lint, check-ts, build, test and commit** "Redesign the Security settings".

---

### Task 5: Users and the Add user dialog

**Files:** Modify `frontend/src/components/settings/Users.vue` and `en.json`.

- [ ] **Step 1:** `get_design_context` on `138:2734` and `142:2754`.
- [ ] **Step 2: Implement** the rows (avatar initial, badges You/Owner/2FA on/2FA off/Disabled with the token colours from the spec, and the Reset 2FA / Disable or Enable / Delete buttons, gated as today), the header **Add user** button (owner only, teleported to `#settings-header-actions`), and the Add user modal per the spec.
  - The password help text must match the server rule. `addUser` refuses passwords that `check-password-strength` rates "Too weak" (it needs letters and numbers, 6+ characters). Use: "Use letters and numbers, at least 6 characters. Generate makes a strong random password."
  - A repeat-password mismatch shows `passwordsDoNotMatch` under the field, and Add user doesn't emit.
  - On `hidden.bs.modal`, reset the form and error.
- [ ] **Step 3: Check in the app as owner:**
  - add a user (mismatch error first, then success, list reloads);
  - cancel and reopen (empty form);
  - Generate fills both fields;
  - Disable/Enable, Reset 2FA (on a 2FA user), Delete with confirm;
  - as a non-owner: no Add user button and no row buttons;
  - light and dark.
- [ ] **Step 4: Lint, check-ts, build, test and commit** "Redesign the Users settings with an Add user dialog".

---

### Task 6: Global .env List/Raw

**Files:** Modify `frontend/src/components/EnvEditor.vue` (two props and two exports), `frontend/src/components/settings/GlobalEnv.vue` and `en.json`.

**Interfaces:**
- Produces, in `EnvEditor.vue`:
  - prop `listOnly: Boolean` (default `false`): hides the toggle row, forces `mode = "list"`, and doesn't read or write `localStorage`;
  - prop `readonly: Boolean` (default `false`): inputs are `readonly`, and the remove buttons and the auto blank row are hidden;
  - named exports `textToRows` and `rowsToText` (the existing functions). The env drawer's behaviour is unchanged.

- [ ] **Step 1:** `get_design_context` on `148:2973`.
- [ ] **Step 2: Implement** `GlobalEnv.vue`:
  - its own segmented List/Raw switch, styled like `EnvEditor`'s, remembered in `localStorage` `docket.globalEnvView` inside try/catch, default `raw`;
  - "N variables" on the right, where N = `textToRows(globalENV).rows.length`;
  - Raw is the existing CodeMirror, restyled flat;
  - List is `<EnvEditor list-only :readonly="hasComments" ref="list" />`, filled with `reset(textToRows(text).rows)` when List opens;
  - `hasComments` = any line that is blank between content or starts with `#`. When true, show the note `globalEnvCommentsNote`: "This file has comments or blank lines. Edit it in Raw to keep them.";
  - leaving List (to Raw, or Save while in List and not read-only) writes `settings.globalENV = rowsToText(this.$refs.list.collect())`, and stops if `collect()` returns `null`.
- [ ] **Step 3: Check in the app:**
  - a file without comments: add a variable in List, switch to Raw (it's there), Save, reload (it persists);
  - a file with a `#` comment: List is read-only with the note, and Save from List leaves the comment;
  - the env drawer on a stack still works (List/Raw toggle visible, edits apply).
- [ ] **Step 4: Lint, check-ts, build, test and commit** "Add a List view to Global .env and restyle it".

---

### Task 7: About

**Files:** Modify `frontend/src/components/settings/About.vue` and `en.json`.

**Interfaces:**
- Consumes: `getSystemInfo` (Task 1), via `this.$root.getSocket().emit("getSystemInfo", cb)`.

- [ ] **Step 1:** `get_design_context` on `148:3156`.
- [ ] **Step 2: Implement** per the spec:
  - the logo, name, version badge and tagline;
  - the info table, with the Frontend version row only on mismatch, plus the existing warning;
  - `null` shown as `unavailable`;
  - uptime humanised by a small method `formatUptime(seconds): string`. Use the largest whole unit: days, then hours, then minutes, with "less than a minute" under 60 s, and i18n plural keys;
  - the two link buttons;
  - the existing update checkboxes restyled as switches, still using `saveSettings()`.
- [ ] **Step 3: Check in the app:** the rows show values, or Unavailable if Docker is stopped; the links open in a new tab; toggling the update switches saves (reload shows them kept); light and dark.
- [ ] **Step 4: Lint, check-ts, build, test and commit** "Redesign the About settings".

---

### Task 8: Visual comparison and docs

**Files:** Modify `CLAUDE.md` (the "Stack page and drawers" area gains a short "Settings" paragraph: layout in `Settings.vue`, shared `settings.scss`, icons in `assets/settings/`, `getSystemInfo`).

- [ ] **Step 1: Screenshots.** With the app running, take screenshots at 1440×900 of `/settings/general`, `appearance`, `security`, `users`, the Add user dialog, `globalEnv` and `about`, in light and dark (and Users at 375px wide). Use whatever browser tool is available (the in-app browser or Claude in Chrome). Save them in the scratchpad.
- [ ] **Step 2: Compare** each light screenshot side by side with its Figma frame screenshot (`get_screenshot`). List the visible differences in spacing, type or colour, fix them in the page files, and re-shoot.
- [ ] **Step 3: Check the five Review Focus items** and note the result of each in the ledger.
- [ ] **Step 4: Full check:** `npm run lint && npm run check-ts && npm run build:frontend && npm test`. All exit 0.
- [ ] **Step 5: Commit** "Polish settings against Figma and document the layout".

If no browser tool is available, Step 1-2 are deferred to the user: say so in the final message and list the pages to compare.
