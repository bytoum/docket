import { SocketHandler } from "../socket-handler.js";
import { DocketServer } from "../docket-server";
import { log } from "../log";
import { R } from "redbean-node";
import { passwordStrength } from "check-password-strength";
import { generatePasswordHash } from "../password-hash";
import { callbackError, callbackResult, checkLogin, DocketSocket, requireOwner } from "../util-server";
import { LooseObject } from "../../common/util-common";
import { clearTwoFA } from "../two-fa";
import User from "../models/user";

/**
 * User management: list, add, disable/enable, reset password or 2FA, and delete users.
 * Every logged-in user can see the list; only the owner can change it.
 * Local only, not proxied to agents.
 */
export class UserSocketHandler extends SocketHandler {

    create(socket : DocketSocket, server : DocketServer) {

        // List users, without passwords or 2FA data
        socket.on("getUserList", async (callback : unknown) => {
            try {
                checkLogin(socket);

                const rows = await R.getAll("SELECT id, username, active, is_owner, twofa_status, last_active FROM `user` ORDER BY id");

                callbackResult({
                    ok: true,
                    userList: rows.map((row) => ({
                        id: row.id,
                        username: row.username,
                        active: !!row.active,
                        isOwner: !!row.is_owner,
                        twoFA: !!row.twofa_status,
                        lastActive: toISOStringUTC(row.last_active),
                    })),
                    currentUserID: socket.userID,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Add a user (owner only)
        socket.on("addUser", async (requestData : unknown, callback : unknown) => {
            try {
                await requireOwner(socket);

                if (typeof requestData !== "object" || requestData === null) {
                    throw new Error("Data must be an object");
                }

                const data = requestData as LooseObject;
                const username = typeof data.username === "string" ? data.username.trim() : "";
                const password = typeof data.password === "string" ? data.password : "";

                if (!username) {
                    throw new Error("usernameRequired");
                }

                const existing = await R.findOne("user", " LOWER(username) = LOWER(?) ", [ username ]);
                if (existing) {
                    throw new Error("usernameExists");
                }

                if (passwordStrength(password).value === "Too weak") {
                    throw new Error("Password is too weak. It should contain alphabetic and numeric characters. It must be at least 6 characters in length.");
                }

                const user = R.dispense("user");
                user.username = username;
                user.password = generatePasswordHash(password);
                user.active = true;
                user.is_owner = false;
                await R.store(user);

                log.info("user", `User ${username} added by user ID ${socket.userID}`);

                callbackResult({
                    ok: true,
                    msg: "userAdded",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Disable or enable a user (owner only). Disabling logs them out.
        socket.on("setUserActive", async (userID : unknown, active : unknown, callback : unknown) => {
            try {
                await requireOwner(socket);
                const user = await findOtherUser(socket, userID);

                user.active = !!active;
                await R.store(user);

                if (!user.active) {
                    server.disconnectAllSocketClients(user.id);
                }

                log.info("user", `User ${user.username} ${user.active ? "enabled" : "disabled"} by user ID ${socket.userID}`);

                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Turn off another user's 2FA (owner only), e.g. when they lost their device
        socket.on("resetUser2FA", async (userID : unknown, callback : unknown) => {
            try {
                await requireOwner(socket);
                const user = await findOtherUser(socket, userID);

                await clearTwoFA(user.id);

                log.info("user", `2FA of user ${user.username} reset by user ID ${socket.userID}`);

                callbackResult({
                    ok: true,
                    msg: "twoFAReset",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Set another user's password (owner only), e.g. when they forgot it.
        // Logs them out everywhere, because their tokens carry the old password hash.
        socket.on("resetUserPassword", async (userID : unknown, newPassword : unknown, callback : unknown) => {
            try {
                await requireOwner(socket);
                const user = await findOtherUser(socket, userID);

                const password = typeof newPassword === "string" ? newPassword : "";
                if (passwordStrength(password).value === "Too weak") {
                    throw new Error("Password is too weak. It should contain alphabetic and numeric characters. It must be at least 6 characters in length.");
                }

                await User.resetPassword(user.id, password);
                server.disconnectAllSocketClients(user.id);

                log.info("user", `Password of user ${user.username} reset by user ID ${socket.userID}`);

                callbackResult({
                    ok: true,
                    msg: "userPasswordReset",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Delete a user (owner only). Logs them out first.
        socket.on("deleteUser", async (userID : unknown, callback : unknown) => {
            try {
                await requireOwner(socket);
                const user = await findOtherUser(socket, userID);

                server.disconnectAllSocketClients(user.id);
                await R.trash(user);

                log.info("user", `User ${user.username} deleted by user ID ${socket.userID}`);

                callbackResult({
                    ok: true,
                    msg: "userDeleted",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}

/**
 * Turn a stored UTC datetime into an ISO string the browser can parse.
 * SQLite returns "YYYY-MM-DD HH:mm:ss" text, MySQL a Date.
 * @param {unknown} value Value from the last_active column
 * @returns {string|null} ISO 8601 string in UTC, or null when never set
 */
function toISOStringUTC(value : unknown) : string | null {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === "string" && value) {
        return value.replace(" ", "T") + "Z";
    }
    return null;
}

/**
 * Find a user the caller may change: it must exist and must not be the caller
 * @param {DocketSocket} socket Caller's socket
 * @param {unknown} userID ID of the user to change
 * @returns {Promise<LooseObject>} The user bean
 */
async function findOtherUser(socket : DocketSocket, userID : unknown) {
    const id = Number(userID);
    if (!Number.isInteger(id)) {
        throw new Error("userNotFound");
    }
    if (id === socket.userID) {
        throw new Error("cannotChangeOwnUser");
    }

    const user = await R.findOne("user", " id = ? ", [ id ]);
    if (!user) {
        throw new Error("userNotFound");
    }
    return user;
}
