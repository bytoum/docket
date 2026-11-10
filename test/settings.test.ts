import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Socket } from "socket.io-client";
import { Backend, call, closeAll, connect, OWNER, setupUsers, startBackend, TESTER } from "./helpers/backend";

describe("settings", () => {
    let backend : Backend;
    let owner : Socket;

    before(async () => {
        backend = await startBackend();
        await setupUsers(backend.url);
        owner = await connect(backend.url);
        const res = await call(owner, "login", OWNER);
        assert.equal(res.ok, true);
    });

    after(async () => {
        closeAll();
        await backend?.stop();
    });

    /**
     * Read the current global.env text
     * @returns {Promise<string>} globalENV from getSettings
     */
    const globalEnv = async () : Promise<string> => (await call(owner, "getSettings")).data.globalENV;

    it("saves global.env", async () => {
        const res = await call(owner, "setSettings", { globalENV: "TZ=UTC\n" }, "");
        assert.equal(res.ok, true);
        assert.equal(await globalEnv(), "TZ=UTC\n");
    });

    it("keeps global.env when a save does not include it", async () => {
        // The settings page sends {} if a save happens before getSettings has replied
        const res = await call(owner, "setSettings", { checkUpdate: false }, "");
        assert.equal(res.ok, true);
        assert.equal(await globalEnv(), "TZ=UTC\n");
    });

    it("removes global.env when it is saved empty", async () => {
        const res = await call(owner, "setSettings", { globalENV: "" }, "");
        assert.equal(res.ok, true);
        assert.equal(await globalEnv(), "# VARIABLE=value #comment");
    });

    it("hides global.env from a non-owner and ignores their changes to it", async () => {
        assert.equal((await call(owner, "setSettings", { globalENV: "SECRET=1\n" }, "")).ok, true);

        const tester = await connect(backend.url);
        assert.equal((await call(tester, "login", TESTER)).ok, true);

        const read = await call(tester, "getSettings");
        assert.equal(read.ok, true);
        assert.equal(read.data.globalENV, undefined);

        const write = await call(tester, "setSettings", { globalENV: "SECRET=2\n" }, "");
        assert.equal(write.ok, true);
        assert.equal(await globalEnv(), "SECRET=1\n");
    });
});
