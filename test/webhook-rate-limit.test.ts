/*
 * The webhook endpoint's rate limit. Its own backend, so the limit does not
 * touch the other webhook tests.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Backend, closeAll, startBackend } from "./helpers/backend";

describe("webhook rate limit", () => {
    let backend : Backend;

    before(async () => {
        backend = await startBackend();
    });

    after(async () => {
        closeAll();
        await backend?.stop();
    });

    it("answers 429 after 30 requests in a minute", async () => {
        const statuses : number[] = [];
        for (let i = 0; i < 31; i++) {
            statuses.push((await fetch(`${backend.url}/api/webhook/nope`, { method: "POST" })).status);
        }
        assert.deepEqual(statuses.slice(0, 30), Array(30).fill(404));
        assert.equal(statuses[30], 429);
    });
});
