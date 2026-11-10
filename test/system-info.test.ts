/*
 * The getSystemInfo event that feeds the About page.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Backend, call, closeAll, connect, OWNER, setupUsers, startBackend } from "./helpers/backend";

describe("getSystemInfo", () => {
    let backend : Backend;

    before(async () => {
        backend = await startBackend();
        await setupUsers(backend.url);
    });

    after(async () => {
        closeAll();
        await backend?.stop();
    });

    it("refuses a logged-out client", async () => {
        const res = await call(await connect(backend.url), "getSystemInfo");
        assert.notEqual(res.ok, true);
        assert.equal(res.host, undefined);
    });

    it("returns host, uptime and Docker versions", async () => {
        const socket = await connect(backend.url);
        const login = await call(socket, "login", OWNER);
        assert.equal(login.ok, true);

        const res = await call(socket, "getSystemInfo");
        assert.equal(res.ok, true);
        assert.ok(typeof res.host === "string" && res.host.length > 0);
        assert.ok(Number.isInteger(res.uptimeSeconds) && res.uptimeSeconds >= 0);
        for (const v of [ res.dockerVersion, res.composeVersion ]) {
            assert.ok(v === null || (typeof v === "string" && v.length > 0));
        }
    });
});
