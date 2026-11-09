# Multi-user support: design

Date: 2026-11-09
Status: approved in discussion, waiting for spec review

## Goal

Let several people use one Docket instance, each with their own username and password.

Everyone who can log in has full access, as the single user does today. One account, the **owner**, is the only one who can add, disable and delete users.

## Decisions

| Question | Decision |
|---|---|
| What can extra users do? | Everything. There are no roles or permission checks on stack, terminal, settings or agent events. |
| Who manages users? | Only the owner: the account created at setup, or the existing user on an upgraded install. |
| How is the owner stored? | A new `user.is_owner` boolean column. |

## Current state

- The `user` table already supports several rows (`username` unique, `password`, `active`).
- `login` and `loginByToken` already look users up by username and reject `active = 0`.
- `setup` creates the first and only user. Nothing else creates users.
- Disabling a user in the DB does not end their open sessions.
- With "disable auth" on, every socket is auto-logged-in as `R.findOne("user")`.
- `extra/reset-password.ts` always resets the first user.

## Data model

Add the migration `backend/migrations/<YYYY-MM-DD-HHMM>-user-owner.ts`:

- `up`: add `is_owner` (boolean, not null, default `false`) to `user`. Then set `is_owner = true` on the row with the lowest `id`, if there is one.
- `down`: drop `is_owner`.

`setup` sets `is_owner = true` on the user it creates.

## Backend

### Owner check

Add `requireOwner(socket)` to `backend/util-server.ts`. It loads the user for `socket.userID` with `active = 1` and throws `Error("ownerOnly")` unless `is_owner` is set. It reads the DB on every call; the flag is not cached on the socket.

### `backend/socket-handlers/user-socket-handler.ts`

This is a new `SocketHandler`, registered in `DockgeServer.socketHandlerList`. It is local-only and is not proxied to agents. Every event calls `checkLogin(socket)` first and replies with `callbackResult` / `callbackError`. Error messages are i18n keys (`msgi18n: true`).

| Event | Caller | Behaviour |
|---|---|---|
| `getUserList(callback)` | any logged-in user | Replies `{ ok, userList: [{ id, username, active, isOwner }], currentUserID }`, ordered by `id`. Never includes password hashes or 2FA fields. |
| `addUser({ username, password }, callback)` | owner | Trims `username`. If it is empty → `usernameRequired`. If a user with `LOWER(username) = LOWER(?)` exists → `usernameExists`. If the password fails the strength check used by `setup` → the existing "too weak" message. Otherwise it stores the user with the password hash, `active = 1` and `is_owner = 0`. |
| `setUserActive(userID, active, callback)` | owner | If the target is the caller → `cannotChangeOwnUser`. If the target is missing → `userNotFound`. Otherwise it updates `active`. When disabling, it then calls `server.disconnectAllSocketClients(userID)`. |
| `deleteUser(userID, callback)` | owner | Same refusals as `setUserActive`. Otherwise it calls `server.disconnectAllSocketClients(userID)`, then deletes the row. |

### Other backend changes

- **Disable-auth auto-login** (`dockge-server.ts`): look up `R.findOne("user", " is_owner = 1 ")` instead of `R.findOne("user")`.
- **`extra/reset-password.ts`:** if more than one user exists, print the usernames and ask which one to reset. With one user, behaviour is unchanged.
- **Unchanged:** `login`, `loginByToken`, `changePassword` (each user changes their own password), the login rate limiter, and agent connections, which use their own stored credentials.

## Frontend

### Settings → Users

- A new route `/settings/users` with the lazy-loaded component `frontend/src/components/settings/Users.vue`.
- A new `users` entry in the `subMenus` of `frontend/src/pages/Settings.vue`, placed after `security`.
- It uses the same Bootstrap form styling and `Confirm` dialog as `Security.vue`.

Page contents:

1. **Disable-auth warning:** when `settings.disableAuth` is on, a warning says the accounts are not used to log in.
2. **User list:** one row per user, showing:
   - the username;
   - a **You** badge when `id === currentUserID`;
   - an **Owner** badge on the owner;
   - a **Disabled** badge, with the row dimmed, when `active` is false.
3. **Owner-only actions** on every row except the owner's own:
   - **Disable / Enable** (`setUserActive`);
   - **Delete** (`deleteUser`), after a `Confirm` dialog: "Delete user {0}? They will be logged out."
4. **Add user form** (owner only): username, password and repeat password.
   - The repeat field uses the same `is-invalid` / `passwordNotMatchMsg` pattern as Change Password.
   - On success it clears the form, reloads the list and shows a success toast.
5. **Non-owners** see the list without actions, plus the hint "Only the owner can add or remove users."

### Session end for disabled or deleted users

No new code is needed. The server disconnects their sockets. On reconnect, `loginByToken` fails with `authUserInactiveOrDeleted` and the user lands on the login page.

### Strings

New keys go in `frontend/src/lang/en.json` only:

`users`, `addUser`, `ownerBadge`, `youBadge`, `disabledBadge`, `disableUser`, `enableUser`, `deleteUser`, `deleteUserMsg`, `ownerOnly`, `ownerOnlyHint`, `usernameExists`, `usernameRequired`, `userNotFound`, `cannotChangeOwnUser`, `authDisabledUsersHint`.

Reuse the existing `Username`, `Password`, `Repeat Password` and `passwordNotMatchMsg`.

## Edge cases

- **Upgrade:** the single existing user becomes the owner. Existing tokens stay valid, because the JWT payload is unchanged.
- **The owner can't lock themselves out:** they can't disable or delete their own account, so an active owner always exists. `npm run reset-password` recovers a forgotten owner password.
- **A user deleted mid-request:** `checkLogin` / `requireOwner` find no active row and return an error. Nothing crashes.
- **Case-only duplicates** such as `Admin` and `admin` are rejected on both SQLite and MySQL.
- **Calls that skip the UI:** every owner rule is enforced on the server, not only hidden in the UI.

## Verification

There is no test suite. Verification is:

1. `npm run lint`, `npm run check-ts` and `npm run build:frontend` pass.
2. Manual run against a copy of `data/`:
   - The migration marks the existing user as owner.
   - The owner adds user B. B logs in in a second browser and sees Users read-only.
   - The owner disables B: B's tab is logged out and B can't log in. The owner re-enables B: B can log in.
   - The owner deletes B: B is logged out and the row is gone.
   - The owner's own row has no actions. Emitting `setUserActive` or `deleteUser` for the owner's own ID returns `cannotChangeOwnUser`.
   - Adding `admin` when `Admin` exists returns `usernameExists`.
   - `npm run reset-password` with two users asks which one to reset.

## Out of scope

- Roles or permissions, and per-stack access.
- Transferring ownership.
- The owner resetting another user's password.
- Per-user audit logs.
- 2FA (the columns exist but are unused).
