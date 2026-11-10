import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Socket } from "socket.io-client";
import { Backend, call, closeAll, connect, setupUsers, startBackend, TESTER } from "./helpers/backend";

describe("test backend helper", () => {
    let backend : Backend;
    let socket : Socket;

    before(async () => {
        backend = await startBackend();
    });

    after(async () => {
        closeAll();
        await backend?.stop();
    });

    it("starts a backend with temporary data", async () => {
        const tmp = fs.realpathSync(os.tmpdir());
        assert.ok(fs.realpathSync(backend.dataDir).startsWith(tmp), `data dir ${backend.dataDir} is not under ${tmp}`);

        const { ownerID, testerID } = await setupUsers(backend.url);
        assert.equal(typeof ownerID, "number");
        assert.equal(typeof testerID, "number");
        assert.notEqual(ownerID, testerID);
        assert.ok(fs.existsSync(path.join(backend.dataDir, "docket.db")), "docket.db is in the temporary data dir");
    });

    it("rejects a call that gets no reply", async () => {
        socket = await connect(backend.url);
        await assert.rejects(call(socket, "noSuchEvent"), /No reply to "noSuchEvent"/);
    });

    it("logs in with the fixed users", async () => {
        const res = await call(socket, "login", TESTER);
        assert.equal(res.ok, true);
    });

    it("stop removes the data folder and is safe twice", async () => {
        const dataDir = backend.dataDir;
        closeAll();
        await backend.stop();
        await backend.stop();
        assert.equal(fs.existsSync(dataDir), false);
    });

    it("reports output when the backend fails to start", async () => {
        await assert.rejects(
            startBackend("./test/helpers/does-not-exist.ts"),
            (e : Error) => /exited|timed out/i.test(e.message) && /Last output:\n.*does-not-exist/s.test(e.message),
        );
    });

    it("ignores server settings from the developer's environment", async () => {
        // Each of these would stop the tests from reaching the backend
        const leaked : Record<string, string> = {
            DOCKET_HOSTNAME: "192.0.2.1",
            DOCKET_SSL_KEY: "/no/such/key.pem",
            DOCKET_SSL_CERT: "/no/such/cert.pem",
            DOCKET_HIDE_LOG: "info_server",
        };
        const saved = Object.fromEntries(Object.keys(leaked).map((key) => [ key, process.env[key] ]));
        Object.assign(process.env, leaked);
        let other : Backend | undefined;
        try {
            other = await startBackend();
            const { ownerID } = await setupUsers(other.url);
            assert.equal(typeof ownerID, "number");
        } finally {
            for (const [ key, value ] of Object.entries(saved)) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
            await other?.stop();
        }
    });
});
