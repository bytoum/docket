# Settings redesign: design

Date: 2026-11-10
Status: approved in discussion, waiting for spec review

## Goal

Make the Settings pages match the "2 · Settings" section of the Figma file "Dockge – Redesign" (https://www.figma.com/design/F38NzF6eFkGRgcsJUoHSaD), and add the small features those screens show that reuse existing code.

## Figma frames

| Page | Frame |
|---|---|
| General | `115:2246` Docket – Settings (Redesign) |
| Users | `138:2734` Docket – Settings: Users (Redesign) |
| Add user dialog | `142:2754` Docket – Add user dialog |
| Appearance | `147:2784` Docket – Settings: Appearance (Redesign) |
| Security | `148:2796` Docket – Settings: Security (Redesign) |
| Global .env | `148:2973` Docket – Settings: Global .env (Redesign) |
| About | `148:3156` Docket – Settings: About (Redesign) |

Exact spacing, sizes, type and colours come from `get_design_context` on these frames during implementation. Colours always map to the tokens in `frontend/src/styles/vars.scss`, never to hex values copied from Figma.

## Decisions

| Question | Decision |
|---|---|
| Scope | Restyle all six pages and the layout, plus: the Add user dialog with a repeat-password field, the Global .env List/Raw switch, and the About system info. |
| Left out | Appearance → **Density** and **Reduce motion** (they would affect every page, not just Settings). |
| Kept although Figma omits them | About → the "Show update if available" and "Also check beta release" checkboxes, and the frontend/backend version-mismatch warning. Mobile → the Logout item in the settings menu. |
| Not shown in Figma | Users → **Reset 2FA** is a neutral button, styled like Disable, shown before Disable only when the user has 2FA on. |
| Dark mode | Every new style has a dark value from the `$dark-*` tokens, following the existing `.dark` pattern. |

## Shared layout: `frontend/src/pages/Settings.vue`

- **Page header:** "Settings" (large and bold), then the subtitle `settingsSubtitle`: "Manage how this Docket instance looks and behaves".
- **Side menu:** one item per page, with an icon and a label. Icons are exported from Figma (the "Settings Menu" layers) as SVGs into `frontend/src/assets/settings/` (`general.svg`, `appearance.svg`, `security.svg`, `users.svg`, `global-env.svg`, `about.svg`) and shown with `AssetIcon`. The active item gets the accent-subtle background and accent text. On mobile, the menu remains its own screen (current behaviour), and the Logout item stays at the bottom.
- **Content card:** surface background, 4px radius, no border. The card header has the page title, a one-line description and a divider, plus an optional slot on the right for actions (used by Users).
- **Page metadata:** each entry in `subMenus` gains `icon` and `description` (i18n keys). The card header reads them, so pages no longer render their own titles.
- **Shared styles:** new `frontend/src/styles/settings.scss`, imported by `Settings.vue` and the page components. It holds:
  - `.settings-section` (subheading and spacing);
  - `.settings-field` (label, filled input, help text);
  - `.settings-row` (label and description on the left, action on the right, as in Security);
  - `.btn-subtle` (neutral filled button: "Auto get", "Generate", "Manage", "Disable"/"Enable");
  - `.btn-danger-subtle` (red text on danger-subtle: "Delete", "Disable" sign-in);
  - `.status-badge` with modifiers `--accent`, `--success`, `--warning` and `--neutral`, each with a leading dot.

  It replaces the duplicated `.status-badge` styles now in `Security.vue` and `TwoFADialog.vue`.

## Pages

### General (`General.vue`)
"Primary hostname": a filled input with the placeholder "(Unset: follow current hostname)", an "Auto get" `.btn-subtle` in the same row, help text "Used when Docket builds links to your stacks. Leave empty to use the hostname you are visiting.", and a Save button. Behaviour is unchanged.

### Appearance (`Appearance.vue`)
- **Theme:** three selectable cards (Light, Dark, System), each with a small preview drawn in CSS (light, dark, half-and-half) and a radio. The selected card gets the accent-subtle background and accent label. They are bound to the existing theme setting. Keyboard: the cards are radio inputs, so arrow keys and Space work.
- **Language:** a styled select with the help text "Used for all labels and messages in the interface." and the existing language list and behaviour.
- The Figma "Save" button is not added. Theme and language already apply at once, as they do today.

### Security (`Security.vue`)
- **Change password:** the existing three fields as `.settings-field`, plus "Update password".
- **Two-factor authentication:** a `.settings-row` with "Authenticator app", a badge (Enabled = success, Disabled = neutral), the description "Require a one-time code from an authenticator app when signing in." and a **Manage** button that opens `TwoFADialog`. It is hidden when auth is disabled, as today.
- **Disable authentication:** a `.settings-row` with "Turn off sign-in", the description "Anyone who can reach this instance gets full access. Not recommended." and a `.btn-danger-subtle` **Disable** button with a trash icon, which runs the existing confirm flow. When auth is already disabled, the row shows the **Enable** button instead.

### Users (`Users.vue`)
- The card header action is **Add user** (primary, plus icon), shown to the owner only.
- An "Accounts" subheading, then one row per user, each with:
  - a circle avatar with the first letter;
  - the username;
  - badges: You (accent), Owner (success), 2FA on (success), 2FA off (warning), Disabled (neutral);
  - on the right, for the owner on other users: Reset 2FA (only when 2FA is on), Disable or Enable, and Delete (`.btn-danger-subtle` with a trash icon).
- **Add user dialog** (Bootstrap modal), titled "Add user", with the subtitle "Create an account that can sign in to this instance." Fields:
  - Username;
  - Password, with Generate next to it and the help text "At least 8 characters. Use Generate for a strong random password.";
  - Repeat password.

  Buttons are Cancel and **Add user**. Generate fills both password fields and shows the password, keeping the existing copy action. If the passwords don't match, Add user shows `passwordsDoNotMatch` and does not emit. On success, the modal closes, the list reloads and the form clears.
- Behaviour, events and the owner gating are unchanged. The inline add form is removed.
- **Help text vs backend:** check the existing strength rule in `addUser` and phrase the help text so it doesn't promise a rule the server doesn't enforce. If the server's minimum differs from 8, use its rule in the text.

### Global .env (`GlobalEnv.vue`)
- A segmented switch (**List** / **Raw**, default Raw, remembered in `localStorage` key `docket.globalEnvView` inside try/catch), and "N variables" on the right. N counts non-empty, non-comment `KEY=value` lines.
- **List** uses the existing `EnvEditor` key/value mode. **Raw** keeps the CodeMirror editor, restyled to the filled flat look. Both read and write the same `settings.globalENV` string, so switching never loses edits. Comments and blank lines must survive a List edit; if `EnvEditor`'s list mode can't keep them, the List view is read-only for files that have comments, with a note to use Raw.
- Save, as today.

### About (`About.vue`)
- Logo (32px), "Docket" and a version badge (`v<version>`, accent), then the tagline `aboutTagline`: "A self-hosted manager for Docker Compose stacks."
- An info table with these rows:

  | Row | Value |
  |---|---|
  | Version | the backend version |
  | Frontend version | only when it differs from the backend version, with the existing warning |
  | Docker Engine | from `getSystemInfo` |
  | Docker Compose | from `getSystemInfo` |
  | Host | from `getSystemInfo` |
  | Uptime | humanised, e.g. "12 days", "3 hours", "5 minutes" |

- Buttons: **Check for updates** (links to `https://github.com/bytoum/docket/releases`) and **Documentation →** (links to `https://github.com/bytoum/docket#readme`), both `.btn-subtle` and opening in a new tab.
- Below them, the existing update checkboxes, restyled as switches.

## Backend: `getSystemInfo`

A new event in `backend/socket-handlers/main-socket-handler.ts`. It is local, `checkLogin` first, and not proxied to agents, because Settings describes this instance.

`getSystemInfo(callback)` replies `{ ok: true, dockerVersion, composeVersion, host, uptimeSeconds }`:
- `dockerVersion`: `docker version --format "{{.Server.Version}}"`, trimmed, or `null` on failure or timeout (5 s).
- `composeVersion`: `docker compose version --short`, trimmed, or `null` the same way.
- `host`: `` `${os.type()} ${os.arch()}` ``, e.g. "Linux x64".
- `uptimeSeconds`: `Math.floor(process.uptime())`.

The frontend shows `null` as `unavailable` ("Unavailable"). It uses the existing `childProcessAsync.spawn` pattern from `docket-server.ts`. If both Docker calls fail, the reply is still `ok`.

## i18n

New strings go only in `frontend/src/lang/en.json`: `settingsSubtitle`, a description per page, the field help texts above, `addUserDialogSubtitle`, `repeatPassword` (unless it already exists), `passwordsDoNotMatch`, the List/Raw labels, `variablesCount`, `aboutTagline`, the About row labels, `unavailable`, the uptime units, `checkForUpdates`, `documentation`, and the Security row labels and descriptions. Reuse existing keys where they exist.

## Testing

- Backend: add `test/system-info.test.ts`:
  - `getSystemInfo` while logged out → not ok;
  - logged in → `ok`, `host` is a non-empty string, `uptimeSeconds` is a number ≥ 0, and each Docker field is a string or `null`. That holds both without Docker (CI) and with it.
- `npm run lint`, `npm run check-ts`, `npm run build:frontend` and `npm test` pass.
- Visual check: run the app (`DOCKET_STACKS_DIR=$PWD/stacks`, backend on 5001, frontend on 5173). Screenshot each of the six pages and the Add user dialog in light and dark mode, and compare them side by side with the Figma frames. Fix differences in spacing, type or colour that show at normal zoom.
- Behaviour check in the running app:
  - General: save the hostname.
  - Appearance: switch theme and language.
  - Security: change password; Manage opens the 2FA dialog.
  - Users: add a user through the dialog, including the mismatch error; disable, enable, reset 2FA, delete.
  - Global .env: edit in List, switch to Raw, the edit is still there, save, reload.
  - About: the rows have values.
