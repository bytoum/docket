/*
 * Two-factor authentication, end to end over socket.io.
 *
 * The tests run in order and build on each other, against one backend.
 * Rate limits are global per backend (login 20/min, 2FA code checks 30/min).
 * This file uses 11 login calls (including setupUsers) and 9 code checks
 * (verifyToken calls plus logins that carry a code). Split the file before
 * adding enough calls to reach either limit; do not loosen the limiters.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Socket } from "socket.io-client";
import { Backend, call, closeAll, codeFor, connect, OWNER, setupUsers, startBackend, TESTER } from "./helpers/backend";

describe("two-factor authentication", () => {
    let backend : Backend;
    let ownerID : number;
    let testerID : number;
    let tester : Socket;
    let owner : Socket;
    let uri : string;
    let usedCode : string;

    /**
     * Log in on a fresh socket, so earlier logins don't affect this one
     * @param {object} data Login payload
     * @returns {Promise<any>} The login reply
     */
    const freshLogin = async (data : object) => call(await connect(backend.url), "login", data);

    before(async () => {
        backend = await startBackend();
        ({ ownerID, testerID } = await setupUsers(backend.url));
        tester = await connect(backend.url);
        const res = await call(tester, "login", TESTER);
        assert.equal(res.ok, true, "tester can log in before 2FA");
    });

    after(async () => {
        closeAll();
        await backend?.stop();
    });

    // Setup

    it("1. 2FA is off for a new user", async () => {
        const res = await call(tester, "twoFAStatus");
        assert.equal(res.ok, true);
        assert.equal(res.status, false);
    });

    it("2. prepare2FA refuses a wrong password", async () => {
        const res = await call(tester, "prepare2FA", "wrong-password");
        assert.notEqual(res.ok, true);
        assert.equal(res.uri, undefined);
    });

    it("3. prepare2FA returns the same URI when called twice", async () => {
        const first = await call(tester, "prepare2FA", TESTER.password);
        const second = await call(tester, "prepare2FA", TESTER.password);
        assert.equal(first.ok, true);
        assert.match(first.uri, /^otpauth:\/\/totp\/Docket:tester\?/);
        assert.equal(second.uri, first.uri);
        uri = first.uri;
    });

    it("4. verifyToken accepts the current code and rejects others", async () => {
        const good = await call(tester, "verifyToken", codeFor(uri), TESTER.password);
        assert.equal(good.valid, true);

        if (codeFor(uri) !== "000000") {
            const wrong = await call(tester, "verifyToken", "000000", TESTER.password);
            assert.equal(wrong.valid, false);
        }

        const number = await call(tester, "verifyToken", 123456, TESTER.password);
        assert.equal(number.valid, false);
    });

    it("5. save2FA turns 2FA on", async () => {
        const saved = await call(tester, "save2FA", TESTER.password);
        assert.equal(saved.ok, true);
        assert.equal(saved.msg, "twoFAEnabled");

        const status = await call(tester, "twoFAStatus");
        assert.equal(status.status, true);

        const again = await call(tester, "prepare2FA", TESTER.password);
        assert.equal(again.ok, false);
        assert.equal(again.msg, "twoFAAlreadyEnabled");
    });

    // Login

    it("6. login with only a password asks for a code", async () => {
        const res = await freshLogin(TESTER);
        assert.equal(res.tokenRequired, true);
        assert.notEqual(res.ok, true);
        assert.equal(res.token, undefined);
    });

    it("7. login with a non-numeric code is refused", async () => {
        const res = await freshLogin({ ...TESTER,
            token: "abcdef" });
        assert.equal(res.ok, false);
        assert.equal(res.msg, "authInvalidToken");
    });

    it("8. login with a valid code succeeds", async () => {
        usedCode = codeFor(uri);
        const res = await freshLogin({ ...TESTER,
            token: usedCode });
        assert.equal(res.ok, true);
        assert.equal(typeof res.token, "string");
    });

    it("9. a code cannot be used twice, with or without a space", async () => {
        const again = await freshLogin({ ...TESTER,
            token: usedCode });
        assert.equal(again.msg, "authInvalidToken", "reused code must be refused");

        const spaced = await freshLogin({ ...TESTER,
            token: `${usedCode.slice(0, 3)} ${usedCode.slice(3)}` });
        assert.equal(spaced.msg, "authInvalidToken", "reused code with a space must be refused");
    });

    it("10. a wrong password with 2FA on does not ask for a code", async () => {
        const res = await freshLogin({ username: TESTER.username,
            password: "wrong-password" });
        assert.equal(res.ok, false);
        assert.equal(res.msg, "authIncorrectCreds");
        assert.equal(res.tokenRequired, undefined);
    });

    // Owner reset

    it("11. only the owner can reset 2FA", async () => {
        const res = await call(tester, "resetUser2FA", ownerID);
        assert.equal(res.ok, false);
        assert.equal(res.msg, "ownerOnly");
    });

    it("12. the user list shows 2FA without leaking the secret", async () => {
        owner = await connect(backend.url);
        const login = await call(owner, "login", OWNER);
        assert.equal(login.ok, true);

        const res = await call(owner, "getUserList");
        const row = res.userList.find((u : { id : number }) => u.id === testerID);
        assert.equal(row.twoFA, true);
        for (const user of res.userList) {
            const leaked = Object.keys(user).filter((key) => /twofa_|secret/i.test(key));
            assert.deepEqual(leaked, [], `user ${user.username} leaks ${leaked.join(", ")}`);
        }
    });

    it("13. the owner cannot reset themselves or an unknown user", async () => {
        const self = await call(owner, "resetUser2FA", ownerID);
        assert.equal(self.msg, "cannotChangeOwnUser");

        const unknown = await call(owner, "resetUser2FA", 999999);
        assert.equal(unknown.msg, "userNotFound");
    });

    it("14. the owner can reset another user's 2FA", async () => {
        const res = await call(owner, "resetUser2FA", testerID);
        assert.equal(res.ok, true);

        const status = await call(tester, "twoFAStatus");
        assert.equal(status.status, false);
    });

    // Other rules

    it("15. once 2FA is off, a code sent at login is ignored", async () => {
        const res = await freshLogin({ ...TESTER,
            token: "999999" });
        assert.equal(res.ok, true);
    });

    it("16. a password change discards a pending 2FA setup", async () => {
        const before = await call(tester, "prepare2FA", TESTER.password);
        assert.equal(before.ok, true);

        const newPassword = "Tester67890";
        const changed = await call(tester, "changePassword", { currentPassword: TESTER.password,
            newPassword });
        assert.equal(changed.ok, true, `changePassword failed: ${changed.msg}`);

        const after = await call(tester, "prepare2FA", newPassword);
        assert.equal(after.ok, true);
        assert.notEqual(after.uri, before.uri);

        const restored = await call(tester, "changePassword", { currentPassword: newPassword,
            newPassword: TESTER.password });
        assert.equal(restored.ok, true, "password restored for later tests");
    });

    it("17. a logged-out client cannot check codes", async () => {
        const anonymous = await connect(backend.url);
        const res = await call(anonymous, "verifyToken", "123456", TESTER.password);
        assert.notEqual(res.ok, true);
        assert.equal(res.valid, undefined);
    });

    it("18. disable2FA turns 2FA off", async () => {
        await call(tester, "prepare2FA", TESTER.password);
        const saved = await call(tester, "save2FA", TESTER.password);
        assert.equal(saved.ok, true);

        const disabled = await call(tester, "disable2FA", TESTER.password);
        assert.equal(disabled.ok, true);
        assert.equal(disabled.msg, "twoFADisabled");

        const status = await call(tester, "twoFAStatus");
        assert.equal(status.status, false);
    });
});
