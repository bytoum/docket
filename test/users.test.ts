/*
 * User management by the owner, end to end over socket.io.
 *
 * The tests run in order and build on each other, against one backend.
 * This file uses 6 login calls (including setupUsers), well under the
 * login rate limit of 20 per minute.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Socket } from "socket.io-client";
import { Backend, call, closeAll, connect, OWNER, setupUsers, startBackend, TESTER } from "./helpers/backend";

const NEW_PASSWORD = "n3w-Password-42";

describe("owner resets a user's password", () => {
    let backend : Backend;
    let ownerID : number;
    let testerID : number;
    let owner : Socket;
    let tester : Socket;

    before(async () => {
        backend = await startBackend();
        ({ ownerID, testerID } = await setupUsers(backend.url));
        owner = await connect(backend.url);
        assert.equal((await call(owner, "login", OWNER)).ok, true);
        tester = await connect(backend.url);
        assert.equal((await call(tester, "login", TESTER)).ok, true);
    });

    after(async () => {
        closeAll();
        await backend?.stop();
    });

    it("1. a non-owner cannot reset a password", async () => {
        const res = await call(tester, "resetUserPassword", ownerID, NEW_PASSWORD);
        assert.notEqual(res.ok, true);
    });

    it("2. the owner cannot reset their own password here", async () => {
        const res = await call(owner, "resetUserPassword", ownerID, NEW_PASSWORD);
        assert.notEqual(res.ok, true);
        assert.equal(res.msg, "cannotChangeOwnUser");
    });

    it("3. a weak password is refused", async () => {
        const res = await call(owner, "resetUserPassword", testerID, "abc");
        assert.notEqual(res.ok, true);
    });

    it("4. the owner resets the tester's password and the tester is logged out", async () => {
        const disconnected = new Promise<void>((resolve) => tester.once("disconnect", () => resolve()));
        const res = await call(owner, "resetUserPassword", testerID, NEW_PASSWORD);
        assert.equal(res.ok, true);
        assert.equal(res.msg, "userPasswordReset");
        await disconnected;
    });

    it("5. the old password no longer works and the new one does", async () => {
        const old = await call(await connect(backend.url), "login", TESTER);
        assert.notEqual(old.ok, true);

        const fresh = await call(await connect(backend.url), "login", {
            username: TESTER.username,
            password: NEW_PASSWORD,
        });
        assert.equal(fresh.ok, true);
    });
});
