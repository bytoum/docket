# Mobile layout: design

Date: 2026-11-10
Status: approved in discussion, waiting for spec review

## Goal

Make Docket usable on a phone. Below 768px wide, the top header stays, and the stack sidebar becomes a slide-in drawer instead of squeezing every page.

## Background

`$root.isMobile` is read in `Layout.vue`, `Dashboard.vue` and `Settings.vue`, but it was never defined. Upstream Dockge has the same gap, left over from Uptime Kuma, so the app has never switched to a mobile layout. Defining it alone would hide the header and sidebar and leave no navigation, so this design also changes both.

## Decisions

| Question | Decision |
|---|---|
| Phone navigation | Keep the header. The stack sidebar becomes a drawer opened from a menu button in the header. |
| Breakpoint | `window.innerWidth < 768`, the same as the Settings media query (767.98px). |
| Out of scope | A bottom tab bar, phone layouts for the stack page, drawers and console, and Figma mobile frames (there are none). |

## `isMobile`: `frontend/src/mixins/mobile.ts`

A new mixin, added to the root app's `mixins` in `frontend/src/main.ts` next to `theme`:

- `data`: `windowWidth: window.innerWidth`, `sidebarOpen: false`.
- `computed`: `isMobile()` returns `this.windowWidth < 768`.
- `mounted`: add a `resize` listener that updates `windowWidth`. `unmounted`: remove it.
- `watch`: when `isMobile` becomes false, set `sidebarOpen = false`.
- `watch` `$route` (`fullPath`): set `sidebarOpen = false`, so following any link closes the drawer.

Every existing reader of `$root.isMobile` then works: the `.mobile` class in `Layout.vue`, the `.mobile &` styles in `Dashboard.vue` and `Settings.vue`, the Settings menu-only screen and its Logout item.

## Header: `frontend/src/layouts/Layout.vue`

- Remove `v-if="! $root.isMobile"` from the header, so it always renders.
- On mobile, add a menu button before the brand. It is a `<button type="button">` with a hamburger icon (`font-awesome-icon icon="bars"`; check that the icon is registered in the app's icon library and add it there if not), `:aria-label="$t('openMenu')"`, `:aria-expanded="$root.sidebarOpen"` and `aria-controls="app-sidebar"`. It toggles `$root.sidebarOpen`. It is shown only when logged in.
- At mobile width:
  - Home and Console show their icon only, with the text in `aria-label` and `title`;
  - the "new update" button shows its icon only;
  - the header padding shrinks so logo + wordmark + menu + Home + Console + account fit in 375px.
- Desktop is unchanged.

## Sidebar drawer: `frontend/src/pages/Dashboard.vue`

- Remove `v-if="!$root.isMobile"` from the `<aside>` and give it `id="app-sidebar"`.
- On desktop it is unchanged.
- On mobile:
  - the aside is `position: fixed`, left 0, from the header's bottom edge to the bottom of the screen, width `min(85vw, 320px)`;
  - it slides in with `transform: translateX(-100%)` → `0` when `$root.sidebarOpen`, and has a shadow;
  - a backdrop (`<div class="sidebar-backdrop">`, full screen below the header, dark with partial opacity from tokens) sits behind it while open, and tapping it closes the drawer;
  - Esc closes the drawer (a keydown listener while open);
  - with `prefers-reduced-motion: reduce`, there is no slide transition.
- Colours from `vars.scss` tokens, with `.dark` overrides.
- Choosing a stack, Compose or any link closes the drawer through the route watcher.

## Page content

`.content` already uses 16px padding under `.mobile`. Settings already has its mobile flow (the menu as its own screen) and the 767.98px media query from the redesign. No other page changes.

## i18n

New strings only in `frontend/src/lang/en.json`: `openMenu` ("Open menu"). Reuse `home` and `console` for the icon-only labels.

## Testing

- `npm run lint`, `npm run check-ts`, `npm run build:frontend` and `npm test` pass.
- Headless-Chrome screenshots, using the CDP approach from the Settings redesign, of Home, a stack page (`/compose/<name>` from a seeded stack, or the compose page), `/settings` and `/settings/users`:
  - at 375×812 in light and dark, with the drawer closed and open;
  - at 1440×900.
- Checks:
  - at 375px, no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`);
  - the header fits on one line;
  - the menu button opens the drawer;
  - tapping the backdrop, pressing Esc and navigating each close it;
  - at 1440px, the header and sidebar look the same as on `main`.
