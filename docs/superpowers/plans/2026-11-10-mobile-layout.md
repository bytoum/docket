# Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below 768px, keep the header and turn the stack sidebar into a slide-in drawer, by finally defining `$root.isMobile`.

**Architecture:** A root mixin `mobile.ts` tracks the window width and owns `isMobile` and `sidebarOpen`. `Layout.vue` always renders the header and adds a menu button on mobile. `Dashboard.vue` always renders the sidebar and styles it as a drawer under `.mobile`.

**Tech Stack:** Vue 3 Options API mixins, SCSS tokens, Bootstrap 5, Font Awesome.

**Spec:** `docs/superpowers/specs/2026-11-10-mobile-layout-design.md`

## Global Constraints

- The breakpoint is `window.innerWidth < 768`.
- Desktop (≥ 768px) must look and behave exactly as before.
- Colours only from `frontend/src/styles/vars.scss` tokens, with `.dark` overrides.
- New strings only in `frontend/src/lang/en.json` (`openMenu` = "Open menu"); never edit other lang files.
- 4-space indentation, JSDoc on new methods, kebab-case classes.
- Node 22: `PATH=~/.nvm/versions/node/v22.12.0/bin:$PATH`. `npm run lint` (0 errors), `npm run check-ts`, `npm run build:frontend` and `npm test` pass at the end of every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Rotating a phone or resizing across 768px with the drawer open:** the drawer closes and the desktop sidebar is back in place, with no stuck backdrop. Covered by the `isMobile` watcher in Task 1 and checked in Task 3 by resizing via CDP.
2. **Logged out (login page) on a phone:** no menu button and no drawer, and the login form fits. Checked in Task 3.
3. **Keyboard:** the menu button is reachable and reports `aria-expanded`; Esc closes the drawer. Checked in Task 3.
4. **Pages that already special-case `isMobile`** (Settings menu-only screen, Logout item): they render correctly now that it is true on phones. Checked in Task 3.
5. **No horizontal scroll at 375px** on Home, a stack page and Settings. Checked in Task 3.

---

### Task 1: `isMobile` mixin and header

**Files:**
- Create: `frontend/src/mixins/mobile.ts`
- Modify: `frontend/src/main.ts` (add `mobile` to root `mixins` after `theme`), `frontend/src/layouts/Layout.vue`, `frontend/src/lang/en.json`, and the Font Awesome registration if `bars` is missing (grep `library.add` / `faBars`).

**Interfaces:**
- Produces, on `$root`:
  - `windowWidth: number`;
  - `isMobile: boolean` (computed);
  - `sidebarOpen: boolean`;
  - method `toggleSidebar(): void`.
  - `sidebarOpen` resets to `false` on route change and when `isMobile` becomes false.

- [ ] Step 1: Implement the mixin per the spec section "isMobile". Use a named handler method so `removeEventListener` works.
- [ ] Step 2: Implement the header changes per the spec section "Header".
- [ ] Step 3: Check with `npm run build:frontend` and a quick headless-Chrome screenshot (CDP approach from the Settings redesign; see Task 3) at 375px and 1440px of `/`. Expected: at 1440px the header is identical to `main`; at 375px it's one line with the menu button.
- [ ] Step 4: Run lint, check-ts and test, then commit "Define isMobile and show the header on phones".

### Task 2: Sidebar drawer

**Files:** Modify `frontend/src/pages/Dashboard.vue`.

**Interfaces:**
- Consumes: `$root.isMobile`, `$root.sidebarOpen` and `$root.toggleSidebar()` (Task 1).
- Produces: `<aside id="app-sidebar">`, plus a `.sidebar-backdrop`.

- [ ] Step 1: Implement per the spec section "Sidebar drawer": the drawer styles under `.mobile`, the backdrop with tap-to-close, Esc to close (add the listener while open and remove it on close and on unmount), reduced motion, and tokens with `.dark`.
- [ ] Step 2: Check with a build, then screenshots at 375px with the drawer open and closed (open it via `Runtime.evaluate` clicking the menu button) and at 1440px. Expected: the drawer slides over the content, and at 1440px it's identical to `main`.
- [ ] Step 3: Run lint, check-ts and test, then commit "Turn the stack sidebar into a drawer on phones".

### Task 3: Verification and docs

**Files:** Modify `CLAUDE.md` (Frontend section: one short paragraph covering the `mobile.ts` mixin, `isMobile` < 768px, `sidebarOpen`, and the drawer in `Dashboard.vue`).

- [ ] Step 1: Screenshots via headless Chrome over CDP. Use a throwaway production backend with scratch data and one seeded stack folder in its stacks dir (a `compose.yaml` with one `nginx` service is enough; it doesn't need to run). Take:
  - Home, the stack page, `/settings` and `/settings/users`, at 375×812 in light and dark, drawer closed and open;
  - the same pages at 1440×900;
  - the login page at 375px.
- [ ] Step 2: Check each Review Focus item and record pass or fail:
  - resize from 375 to 1440 with the drawer open (`Emulation.setDeviceMetricsOverride`), then confirm the drawer is closed and the desktop sidebar is shown;
  - `scrollWidth <= innerWidth` at 375px on each page;
  - Esc, a backdrop click and following a stack link each close the drawer;
  - the menu button's `aria-expanded` flips.
- [ ] Step 3: Fix any failure in the owning file, then re-shoot.
- [ ] Step 4: Run lint, check-ts, build:frontend and test, then commit "Verify the mobile layout and document it".
