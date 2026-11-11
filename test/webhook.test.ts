/*
 * Deploy webhooks: the management events and the POST /api/webhook/:token
 * endpoint. No test here runs Docker.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Socket } from "socket.io-client";
import { Backend, call, closeAll, connect, OWNER, setupUsers, startBackend } from "./helpers/backend";

const COMPOSE = "services:\n  web:\n    image: nginx:alpine\n";

/**
 * Call an agent event on the local endpoint
 * @param {Socket} socket Connected socket
 * @param {string} event Agent event name
 * @param {...unknown} args Event arguments, without the callback
 * @returns {Promise<any>} The callback's first argument
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function agentCall(socket : Socket, event : string, ...args : unknown[]) : Promise<any> {
    return call(socket, "agent", "", event, ...args);
}

describe("deploy webhooks", () => {
    let backend : Backend;
    let socket : Socket;

    /**
     * Create a stack folder with a compose file, without Docker
     * @param {string} name Stack name
     * @returns {Promise<void>}
     */
    async function makeStack(name : string) : Promise<void> {
        const dir = path.join(backend.dataDir, "stacks", name);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(path.join(dir, "compose.yaml"), COMPOSE);
    }

    before(async () => {
        backend = await startBackend();
        await setupUsers(backend.url);
        socket = await connect(backend.url);
        const login = await call(socket, "login", OWNER);
        assert.equal(login.ok, true);
        await makeStack("web");
        await makeStack("plain");
    });

    after(async () => {
        closeAll();
        await backend?.stop();
    });

    it("refuses a logged-out client", async () => {
        // The agent proxy drops events from a logged-out client without a reply
        const s = await connect(backend.url);
        await Promise.all([ "getWebhook", "createWebhook", "deleteWebhook" ].map(async (ev) => {
            const res = await agentCall(s, ev, "web").catch(() => ({ ok: false }));
            assert.notEqual(res.ok, true, ev);
            assert.equal(res.token, undefined, ev);
        }));
    });

    it("creates a webhook and never returns the token again", async () => {
        const res = await agentCall(socket, "createWebhook", "web");
        assert.equal(res.ok, true);
        assert.match(res.token, /^[A-Za-z0-9_-]{43}$/);
        const info = await agentCall(socket, "getWebhook", "web");
        assert.equal(info.ok, true);
        assert.ok(info.webhook.createdDate);
        assert.equal(info.webhook.lastTriggered, null);
        assert.equal(info.webhook.lastResult, null);
        assert.equal(JSON.stringify(info).includes(res.token), false);
        assert.equal("tokenHash" in info.webhook || "token_hash" in info.webhook, false);
    });

    it("returns null for a stack without a webhook", async () => {
        const res = await agentCall(socket, "getWebhook", "plain");
        assert.equal(res.ok, true);
        assert.equal(res.webhook, null);
    });

    it("refuses missing stacks, Docket's own stack and bad names", async () => {
        for (const name of [ "missing", "docket", "dockge", "../etc", "A", "", 42 ]) {
            assert.notEqual((await agentCall(socket, "createWebhook", name)).ok, true, String(name));
        }
    });

    /**
     * Call the webhook endpoint
     * @param {string} token Token path segment
     * @param {string} method HTTP method
     * @returns {Promise<Response>} Response
     */
    function hook(token : string, method = "POST") : Promise<Response> {
        return fetch(`${backend.url}/api/webhook/${token}`, { method });
    }

    it("answers 404 for an unknown or odd token", async () => {
        for (const t of [ "nope", "a%2Fb", "..x", "x".repeat(500) ]) {
            const r = await hook(t);
            assert.equal(r.status, 404, t);
            assert.deepEqual(await r.json(), { ok: false,
                msg: "Not found" });
        }
    });

    it("only accepts POST", async () => {
        const { token } = await agentCall(socket, "createWebhook", "web");
        const r = await hook(token, "GET");
        assert.equal(r.status, 404);
        assert.equal((await agentCall(socket, "getWebhook", "web")).webhook.lastTriggered, null);
    });

    it("answers Stack not found when the folder is gone", async () => {
        await makeStack("gone");
        const { token } = await agentCall(socket, "createWebhook", "gone");
        await fs.promises.rm(path.join(backend.dataDir, "stacks", "gone"), { recursive: true });
        const r = await hook(token);
        assert.equal(r.status, 404);
        assert.deepEqual(await r.json(), { ok: false,
            msg: "Stack not found" });
    });

    it("old token stops working after regenerate, new one after delete", async () => {
        const a = (await agentCall(socket, "createWebhook", "web")).token;
        const b = (await agentCall(socket, "createWebhook", "web")).token;
        assert.equal((await (await hook(a)).json()).msg, "Not found");
        await agentCall(socket, "deleteWebhook", "web");
        assert.equal((await (await hook(b)).json()).msg, "Not found");
    });

    it("deletes a webhook", async () => {
        await agentCall(socket, "createWebhook", "web");
        assert.equal((await agentCall(socket, "deleteWebhook", "web")).ok, true);
        assert.equal((await agentCall(socket, "getWebhook", "web")).webhook, null);
    });
});
