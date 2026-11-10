/*
 * Test helper: runs a throwaway Docket backend in a child process and talks
 * to it over socket.io, the same way the browser does.
 */
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io, Socket } from "socket.io-client";
import * as OTPAuth from "otpauth";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;
const CALL_TIMEOUT_MS = 5_000;
const DUPLICATE_WAIT_MS = 300;
const LOG_LINES_KEPT = 50;

export const OWNER = {
    username: "owner",
    password: "Owner12345",
};
export const TESTER = {
    username: "tester",
    password: "Tester12345",
};

export interface Backend {
    url : string;
    dataDir : string;
    stop() : Promise<void>;
}

const openSockets = new Set<Socket>();

/**
 * Find a TCP port that is free right now
 * @returns {Promise<number>} The port
 */
function getFreePort() : Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on("error", reject);
        server.listen(0, () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            server.close(() => resolve(port));
        });
    });
}

/**
 * Start a Docket backend with its own temporary data and stacks folders
 * @param {string} entry Backend entry file, relative to the repo root
 * @returns {Promise<Backend>} The running backend
 */
export async function startBackend(entry = "./backend/index.ts") : Promise<Backend> {
    const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "docket-test-"));
    const stacksDir = path.join(dataDir, "stacks");
    await fs.promises.mkdir(stacksDir);
    const port = await getFreePort();

    // Env set here wins over the repo's .env, because dotenv does not override
    const child = spawn(process.execPath, [ "--import", "tsx", entry ], {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            NODE_ENV: "development",
            DOCKET_PORT: String(port),
            DOCKET_DATA_DIR: dataDir + path.sep,
            DOCKET_STACKS_DIR: stacksDir,
        },
        stdio: [ "ignore", "pipe", "pipe" ],
    });

    const lines : string[] = [];
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    let stopping : Promise<void> | undefined;

    const stop = () : Promise<void> => {
        stopping ??= (async () => {
            await killChild(child, exited);
            await fs.promises.rm(dataDir, { recursive: true,
                force: true });
        })();
        return stopping;
    };

    try {
        await new Promise<void>((resolve, reject) => {
            const onData = (chunk : Buffer) => {
                for (const line of chunk.toString().split(/\r?\n/)) {
                    if (line) {
                        lines.push(line);
                    }
                }
                lines.splice(0, Math.max(0, lines.length - LOG_LINES_KEPT));
                if (lines.some((line) => line.includes("Listening on"))) {
                    clearTimeout(timer);
                    resolve();
                }
            };
            const timer = setTimeout(() => reject(new Error("Backend start timed out")), START_TIMEOUT_MS);
            child.stdout?.on("data", onData);
            child.stderr?.on("data", onData);
            child.once("exit", (code) => {
                clearTimeout(timer);
                reject(new Error(`Backend exited with code ${code} before it was ready`));
            });
        });
    } catch (e) {
        await stop();
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`${message}. Last output:\n${lines.join("\n")}`);
    }

    return {
        url: `http://127.0.0.1:${port}`,
        dataDir,
        stop,
    };
}

/**
 * Stop a child process, forcing it after a timeout
 * @param {ChildProcess} child The process
 * @param {Promise<void>} exited Resolves when it has exited
 * @returns {Promise<void>}
 */
async function killChild(child : ChildProcess, exited : Promise<void>) : Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    child.kill();
    const timer = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
    await exited;
    clearTimeout(timer);
}

/**
 * Open a socket.io connection to a backend
 * @param {string} url Backend URL
 * @returns {Promise<Socket>} The connected socket
 */
export function connect(url : string) : Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = io(url, {
            transports: [ "websocket" ],
            forceNew: true,
            reconnection: false,
        });
        openSockets.add(socket);
        socket.once("connect", () => resolve(socket));
        socket.once("connect_error", reject);
    });
}

/**
 * Emit an event and wait for its callback
 * @param {Socket} socket Connected socket
 * @param {string} event Event name
 * @param {...unknown} args Event arguments, without the callback
 * @returns {Promise<any>} The callback's first argument
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function call(socket : Socket, event : string, ...args : unknown[]) : Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No reply to "${event}"`)), CALL_TIMEOUT_MS);
        socket.emit(event, ...args, (res : unknown) => {
            clearTimeout(timer);
            resolve(res);
        });
    });
}

/**
 * Like call(), but fail if the callback runs more than once
 * @param {Socket} socket Connected socket
 * @param {string} event Event name
 * @param {...unknown} args Event arguments, without the callback
 * @returns {Promise<any>} The callback's first argument
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function callOnce(socket : Socket, event : string, ...args : unknown[]) : Promise<any> {
    return new Promise((resolve, reject) => {
        let replies = 0;
        let first : unknown;
        const timer = setTimeout(() => reject(new Error(`No reply to "${event}"`)), CALL_TIMEOUT_MS);
        socket.emit(event, ...args, (res : unknown) => {
            replies++;
            if (replies === 1) {
                clearTimeout(timer);
                first = res;
                setTimeout(() => {
                    if (replies > 1) {
                        reject(new Error(`"${event}" replied more than once`));
                    } else {
                        resolve(first);
                    }
                }, DUPLICATE_WAIT_MS);
            }
        });
    });
}

/**
 * The current TOTP code for the secret in an otpauth:// URI
 * @param {string} uri otpauth URI from prepare2FA
 * @param {number} offsetSteps Shift by this many 30 s steps
 * @returns {string} 6-digit code
 */
export function codeFor(uri : string, offsetSteps = 0) : string {
    const secret = new URL(uri).searchParams.get("secret");
    if (!secret) {
        throw new Error(`No secret in URI: ${uri}`);
    }
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    return totp.generate({ timestamp: Date.now() + offsetSteps * 30_000 });
}

/**
 * Create the owner (via setup) and the tester (via addUser)
 * @param {string} url Backend URL
 * @returns {Promise<{ ownerID: number, testerID: number }>} User IDs
 */
export async function setupUsers(url : string) : Promise<{ ownerID : number; testerID : number }> {
    const socket = await connect(url);
    try {
        const setup = await call(socket, "setup", OWNER.username, OWNER.password);
        if (!setup.ok) {
            throw new Error(`setup failed: ${setup.msg}`);
        }
        const login = await call(socket, "login", OWNER);
        if (!login.ok) {
            throw new Error(`owner login failed: ${login.msg}`);
        }
        const added = await call(socket, "addUser", TESTER);
        if (!added.ok) {
            throw new Error(`addUser failed: ${added.msg}`);
        }
        const list = await call(socket, "getUserList");
        const find = (name : string) : number => {
            const user = list.userList.find((u : { username : string }) => u.username === name);
            if (!user) {
                throw new Error(`user ${name} not in getUserList`);
            }
            return user.id;
        };
        return {
            ownerID: find(OWNER.username),
            testerID: find(TESTER.username),
        };
    } finally {
        socket.disconnect();
        openSockets.delete(socket);
    }
}

/**
 * Disconnect every socket opened by connect()
 * @returns {void}
 */
export function closeAll() : void {
    for (const socket of openSockets) {
        socket.disconnect();
    }
    openSockets.clear();
}
