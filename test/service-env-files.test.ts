/*
 * Services' env files in the stack folder, saved with saveStack (by file
 * name, null deletes) and returned by getStack (the ones env_file lists).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { Socket } from "socket.io-client";
import { Backend, call, closeAll, connect, OWNER, setupUsers, startBackend } from "./helpers/backend";

const YAML = "services:\n  redis:\n    image: redis:latest\n    env_file: .env.redis\n";
const CUSTOM_YAML = "services:\n  redis:\n    image: redis:latest\n    env_file:\n      - path: ./cache.env\n        required: true\n";
const NO_ENV_YAML = "services:\n  redis:\n    image: redis:latest\n";

describe("service env files", () => {
    let backend : Backend;
    let socket : Socket;
    let stackDir : string;

    before(async () => {
        backend = await startBackend();
        stackDir = path.join(backend.dataDir, "stacks", "env-files");
        await setupUsers(backend.url);
        socket = await connect(backend.url);
        const login = await call(socket, "login", OWNER);
        assert.equal(login.ok, true);
    });

    after(async () => {
        closeAll();
        await backend?.stop();
    });

    it("writes the env file in the stack folder and returns it", async () => {
        const res = await call(socket, "agent", "", "saveStack", "env-files", YAML, "", true, {
            ".env.redis": "PASSWORD=secret\n",
        });
        assert.equal(res.ok, true, res.msg);
        assert.equal(fs.readFileSync(path.join(stackDir, ".env.redis"), "utf-8"), "PASSWORD=secret\n");

        const get = await call(socket, "agent", "", "getStack", "env-files");
        assert.equal(get.ok, true, get.msg);
        assert.deepEqual(get.stack.envFiles, { ".env.redis": "PASSWORD=secret\n" });
    });

    it("still saves without the env files argument", async () => {
        const res = await call(socket, "agent", "", "saveStack", "env-files", YAML, "", false);
        assert.equal(res.ok, true, res.msg);
        // The existing file is kept
        assert.equal(fs.readFileSync(path.join(stackDir, ".env.redis"), "utf-8"), "PASSWORD=secret\n");
    });

    it("renames to a custom file name listed as { path }", async () => {
        const res = await call(socket, "agent", "", "saveStack", "env-files", CUSTOM_YAML, "", false, {
            ".env.redis": null,
            "cache.env": "PASSWORD=secret\n",
        });
        assert.equal(res.ok, true, res.msg);
        assert.equal(fs.existsSync(path.join(stackDir, ".env.redis")), false);

        const get = await call(socket, "agent", "", "getStack", "env-files");
        assert.deepEqual(get.stack.envFiles, { "cache.env": "PASSWORD=secret\n" });
    });

    it("only returns files that env_file lists", async () => {
        const res = await call(socket, "agent", "", "saveStack", "env-files", NO_ENV_YAML, "", false);
        assert.equal(res.ok, true, res.msg);

        const get = await call(socket, "agent", "", "getStack", "env-files");
        assert.deepEqual(get.stack.envFiles, {});
    });

    it("deletes a file when its content is null", async () => {
        const res = await call(socket, "agent", "", "saveStack", "env-files", NO_ENV_YAML, "", false, {
            "cache.env": null,
        });
        assert.equal(res.ok, true, res.msg);
        assert.equal(fs.existsSync(path.join(stackDir, "cache.env")), false);
    });

    it("refuses file names outside the stack folder, .env and compose files", async () => {
        for (const fileName of [ "../../evil", "sub/file.env", "..", ".env", "compose.yaml" ]) {
            const res = await call(socket, "agent", "", "saveStack", "env-files", NO_ENV_YAML, "", false, {
                [fileName]: "X=1\n",
            });
            assert.equal(res.ok, false, fileName);
        }
        assert.equal(fs.existsSync(path.join(backend.dataDir, "evil")), false);
        assert.equal(fs.readFileSync(path.join(stackDir, "compose.yaml"), "utf-8"), NO_ENV_YAML);
    });

    it("refuses a content that is not a string", async () => {
        const res = await call(socket, "agent", "", "saveStack", "env-files", NO_ENV_YAML, "", false, {
            ".env.redis": 42,
        });
        assert.equal(res.ok, false);
    });
});
