/*
 * The webhook endpoint's rate limit. Its own backend, so the limit does not
 * touch the other webhook tests.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Backend, call, closeAll, connect, OWNER, setupUsers, startBackend } from "./helpers/backend";

describe("webhook rate limit", () => {
    let backend : Backend;

    before(async () => {
        backend = await startBackend();
    });

    after(async () => {
        closeAll();
        await backend?.stop();
    });

    it("answers 429 after 30 unknown tokens in a minute, but still serves a valid token", async () => {
        // A valid token whose stack folder is gone: answers without Docker
        await setupUsers(backend.url);
        const socket = await connect(backend.url);
        assert.equal((await call(socket, "login", OWNER)).ok, true);
        const dir = path.join(backend.dataDir, "stacks", "web");
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(path.join(dir, "compose.yaml"), "services:\n  web:\n    image: nginx:alpine\n");
        const { token } = await call(socket, "agent", "", "createWebhook", "web");
        await fs.promises.rm(dir, { recursive: true });

        const statuses : number[] = [];
        for (let i = 0; i < 31; i++) {
            statuses.push((await fetch(`${backend.url}/api/webhook/nope`, { method: "POST" })).status);
        }
        assert.deepEqual(statuses.slice(0, 30), Array(30).fill(404));
        assert.equal(statuses[30], 429);

        // Strangers guessing must not block a real CI call
        const r = await fetch(`${backend.url}/api/webhook/${token}`, { method: "POST" });
        assert.equal(r.status, 404);
        assert.equal((await r.json()).msg, "Stack not found");
    });
});
