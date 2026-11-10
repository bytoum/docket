import { Socket } from "socket.io";
import { Terminal } from "./terminal";
import { randomBytes } from "crypto";
import { log } from "./log";
import { ERROR_TYPE_VALIDATION } from "../common/util-common";
import { R } from "redbean-node";
import { verifyPassword } from "./password-hash";
import fs from "fs";
import { AgentManager } from "./agent-manager";

export interface JWTDecoded {
    username : string;
    h? : string;
    iat? : number;
}

export interface DocketSocket extends Socket {
    userID: number;
    consoleTerminal? : Terminal;
    instanceManager : AgentManager;
    endpoint : string;
    emitAgent : (eventName : string, ...args : unknown[]) => void;
    sessionExpiryTimer? : NodeJS.Timeout;
}

// For command line arguments, so they are nullable
export interface Arguments {
    sslKey? : string;
    sslCert? : string;
    sslKeyPassphrase? : string;
    port? : number;
    hostname? : string;
    dataDir? : string;
    stacksDir? : string;
    enableConsole? : boolean;
    sessionExpiry? : string;
}

// Some config values are required
export interface Config extends Arguments {
    dataDir : string;
    stacksDir : string;
}

const DURATION_UNITS : Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
};

/**
 * Parse a session expiry such as "30m", "12h", "7d" or "3600" (seconds)
 * @param {string} value Duration, or "never" for sessions that never expire
 * @returns {number|null} Seconds, or null for "never"
 * @throws {Error} When the value is not a valid positive duration
 */
export function parseSessionExpiry(value : string) : number | null {
    const text = value.trim().toLowerCase();
    if (text === "never") {
        return null;
    }

    const match = /^(\d+)\s*([smhd]?)$/.exec(text);
    const seconds = match ? Number(match[1]) * DURATION_UNITS[match[2] || "s"] : 0;
    if (!seconds) {
        throw new Error(`Invalid session expiry "${value}". Use a number with an optional unit (s, m, h, d), e.g. "12h" or "7d", or "never".`);
    }
    return seconds;
}

export function checkLogin(socket : DocketSocket) {
    if (!socket.userID) {
        throw new Error("You are not logged in.");
    }
}

/**
 * Throw unless the socket is logged in as the owner, the only user who can
 * manage other users. Reads the database every time, so it is always current.
 * @param {DocketSocket} socket Socket to check
 * @returns {Promise<void>}
 */
export async function requireOwner(socket : DocketSocket) {
    checkLogin(socket);

    if (!await isOwner(socket)) {
        throw new Error("ownerOnly");
    }
}

/**
 * Whether the socket's user is the active owner. Reads the database every time.
 * @param {DocketSocket} socket Socket to check
 * @returns {Promise<boolean>} True for the owner
 */
export async function isOwner(socket : DocketSocket) : Promise<boolean> {
    if (!socket.userID) {
        return false;
    }
    const user = await R.findOne("user", " id = ? AND active = 1 ", [
        socket.userID,
    ]);
    return !!user?.is_owner;
}

export class ValidationError extends Error {
    constructor(message : string) {
        super(message);
    }
}

export function callbackError(error : unknown, callback : unknown) {
    if (typeof(callback) !== "function") {
        log.error("console", "Callback is not a function");
        return;
    }

    if (error instanceof Error) {
        callback({
            ok: false,
            msg: error.message,
            msgi18n: true,
        });
    } else if (error instanceof ValidationError) {
        callback({
            ok: false,
            type: ERROR_TYPE_VALIDATION,
            msg: error.message,
            msgi18n: true,
        });
    } else {
        log.debug("console", "Unknown error: " + error);
    }
}

export function callbackResult(result : unknown, callback : unknown) {
    if (typeof(callback) !== "function") {
        log.error("console", "Callback is not a function");
        return;
    }
    callback(result);
}

export async function doubleCheckPassword(socket : DocketSocket, currentPassword : unknown) {
    if (typeof currentPassword !== "string") {
        throw new Error("Wrong data type?");
    }

    let user = await R.findOne("user", " id = ? AND active = 1 ", [
        socket.userID,
    ]);

    if (!user || !verifyPassword(currentPassword, user.password)) {
        throw new Error("Incorrect current password");
    }

    return user;
}

export function fileExists(file : string) {
    return fs.promises.access(file, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
}
