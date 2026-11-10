// @ts-ignore
import composerize from "composerize";
import { SocketHandler } from "../socket-handler.js";
import { DocketServer } from "../docket-server";
import { log } from "../log";
import { R } from "redbean-node";
import type { Knex } from "knex";
import { loginRateLimiter, twoFaRateLimiter } from "../rate-limiter";
import { generatePasswordHash, needRehashPassword, shake256, SHAKE256_LENGTH, verifyPassword } from "../password-hash";
import { User } from "../models/user";
import { verifyToken } from "../two-fa";
import {
    callbackError,
    checkLogin,
    DocketSocket,
    doubleCheckPassword,
    JWTDecoded,
    ValidationError
} from "../util-server";
import { passwordStrength } from "check-password-strength";
import jwt from "jsonwebtoken";
import { Settings } from "../settings";
import fs, { promises as fsAsync } from "fs";
import path from "path";

export class MainSocketHandler extends SocketHandler {
    create(socket : DocketSocket, server : DocketServer) {

        // ***************************
        // Public Socket API
        // ***************************

        // Setup
        socket.on("setup", async (username, password, callback) => {
            try {
                if (passwordStrength(password).value === "Too weak") {
                    throw new Error("Password is too weak. It should contain alphabetic and numeric characters. It must be at least 6 characters in length.");
                }

                if ((await R.knex("user").count("id as count").first()).count !== 0) {
                    throw new Error("Docket has been initialized. If you want to run setup again, please delete the database.");
                }

                const user = R.dispense("user");
                user.username = username;
                user.password = generatePasswordHash(password);
                user.is_owner = true;
                await R.store(user);

                server.needSetup = false;

                callback({
                    ok: true,
                    msg: "successAdded",
                    msgi18n: true,
                });

            } catch (e) {
                if (e instanceof Error) {
                    callback({
                        ok: false,
                        msg: e.message,
                    });
                }
            }
        });

        // Login by token
        socket.on("loginByToken", async (token, callback) => {
            const clientIP = await server.getClientIP(socket);

            log.info("auth", `Login by token. IP=${clientIP}`);

            try {
                // maxAge checks the issue time, so tokens issued before expiry
                // was turned on (or shortened) expire too
                const decoded = jwt.verify(token, server.jwtSecret, server.sessionExpirySeconds ? {
                    maxAge: server.sessionExpirySeconds,
                } : {}) as JWTDecoded;

                log.info("auth", "Username from JWT: " + decoded.username);

                const user = await R.findOne("user", " username = ? AND active = 1 ", [
                    decoded.username,
                ]) as User;

                if (user) {
                    // Check if the password changed
                    if (decoded.h !== shake256(user.password, SHAKE256_LENGTH)) {
                        throw new Error("The token is invalid due to password change or old token");
                    }

                    log.debug("auth", "afterLogin");
                    const expiresAt = server.sessionExpirySeconds && decoded.iat
                        ? (decoded.iat + server.sessionExpirySeconds) * 1000
                        : undefined;
                    await server.afterLogin(socket, user, expiresAt);
                    log.debug("auth", "afterLogin ok");

                    log.info("auth", `Successfully logged in user ${decoded.username}. IP=${clientIP}`);

                    callback({
                        ok: true,
                    });
                } else {

                    log.info("auth", `Inactive or deleted user ${decoded.username}. IP=${clientIP}`);

                    callback({
                        ok: false,
                        msg: "authUserInactiveOrDeleted",
                        msgi18n: true,
                    });
                }
            } catch (error) {
                if (!(error instanceof Error)) {
                    console.error("Unknown error:", error);
                    return;
                }
                if (error instanceof jwt.TokenExpiredError) {
                    log.info("auth", `Session expired. IP=${clientIP}`);
                    callback({
                        ok: false,
                        msg: "authSessionExpired",
                        msgi18n: true,
                    });
                    return;
                }
                log.error("auth", `Invalid token. IP=${clientIP}`);
                if (error.message) {
                    log.error("auth", error.message + ` IP=${clientIP}`);
                }
                callback({
                    ok: false,
                    msg: "authInvalidToken",
                    msgi18n: true,
                });
            }

        });

        // Login
        socket.on("login", async (data, callback) => {
            const clientIP = await server.getClientIP(socket);

            log.info("auth", `Login by username + password. IP=${clientIP}`);

            // Checking
            if (typeof callback !== "function") {
                return;
            }

            if (!data) {
                return;
            }

            // Login Rate Limit
            if (!await loginRateLimiter.pass(callback)) {
                log.info("auth", `Too many failed requests for user ${data.username}. IP=${clientIP}`);
                return;
            }

            try {
                const user = await this.login(data.username, data.password);

                if (!user) {
                    log.warn("auth", `Incorrect username or password for user ${data.username}. IP=${clientIP}`);

                    callback({
                        ok: false,
                        msg: "authIncorrectCreds",
                        msgi18n: true,
                    });
                    return;
                }

                if (!user.twofa_status) {
                    // 2FA is off
                    await server.afterLogin(socket, user);

                    log.info("auth", `Successfully logged in user ${data.username}. IP=${clientIP}`);

                    callback({
                        ok: true,
                        token: User.createJWT(user, server.jwtSecret, server.sessionExpirySeconds),
                    });
                    return;
                }

                if (!data.token) {
                    // 2FA is on, but no code was sent yet
                    log.info("auth", `2FA token required for user ${data.username}. IP=${clientIP}`);

                    callback({
                        tokenRequired: true,
                    });
                    return;
                }

                // 2FA is on and a code was sent
                if (!await twoFaRateLimiter.pass(callback)) {
                    log.info("auth", `Too many 2FA attempts for user ${data.username}. IP=${clientIP}`);
                    return;
                }

                // Normalized the same way as verifyToken, so "123 456" and "123456" are one code
                const code = typeof data.token === "string" ? data.token.replace(/\s/g, "") : "";
                let accepted = false;

                if (code !== user.twofa_last_token && verifyToken(code, user.twofa_secret)) {
                    // Atomically claim the code, so two concurrent logins can't both use it
                    const claimed = await R.knex("user")
                        .where("id", user.id)
                        .andWhere((qb : Knex.QueryBuilder) => {
                            qb.whereNull("twofa_last_token").orWhere("twofa_last_token", "!=", code);
                        })
                        .update({ twofa_last_token: code });
                    accepted = claimed > 0;
                }

                if (!accepted) {
                    log.warn("auth", `Invalid token provided for user ${data.username}. IP=${clientIP}`);

                    callback({
                        ok: false,
                        msg: "authInvalidToken",
                        msgi18n: true,
                    });
                    return;
                }

                await server.afterLogin(socket, user);

                log.info("auth", `Successfully logged in user ${data.username}. IP=${clientIP}`);

                callback({
                    ok: true,
                    token: User.createJWT(user, server.jwtSecret, server.sessionExpirySeconds),
                });
            } catch (e) {
                // Includes a malformed stored secret; reject without leaking details
                log.error("auth", `Login failed for user ${data.username}: ${e instanceof Error ? e.message : e}. IP=${clientIP}`);

                callback({
                    ok: false,
                    msg: "authIncorrectCreds",
                    msgi18n: true,
                });
            }
        });

        // Change Password
        socket.on("changePassword", async (password, callback) => {
            try {
                checkLogin(socket);

                if (! password.newPassword) {
                    throw new Error("Invalid new password");
                }

                if (passwordStrength(password.newPassword).value === "Too weak") {
                    throw new Error("Password is too weak. It should contain alphabetic and numeric characters. It must be at least 6 characters in length.");
                }

                let user = await doubleCheckPassword(socket, password.currentPassword);
                await user.resetPassword(password.newPassword);

                server.disconnectAllSocketClients(user.id, socket.id);

                callback({
                    ok: true,
                    msg: "Password has been updated successfully.",
                });

            } catch (e) {
                if (e instanceof Error) {
                    callback({
                        ok: false,
                        msg: e.message,
                    });
                }
            }
        });

        socket.on("getSettings", async (callback) => {
            try {
                checkLogin(socket);
                const data = await Settings.getSettings("general");

                if (fs.existsSync(path.join(server.stacksDir, "global.env"))) {
                    data.globalENV = fs.readFileSync(path.join(server.stacksDir, "global.env"), "utf-8");
                } else {
                    data.globalENV = "# VARIABLE=value #comment";
                }

                callback({
                    ok: true,
                    data: data,
                });

            } catch (e) {
                if (e instanceof Error) {
                    callback({
                        ok: false,
                        msg: e.message,
                    });
                }
            }
        });

        socket.on("setSettings", async (data, currentPassword, callback) => {
            try {
                checkLogin(socket);

                // If currently is disabled auth, don't need to check
                // Disabled Auth + Want to Disable Auth => No Check
                // Disabled Auth + Want to Enable Auth => No Check
                // Enabled Auth + Want to Disable Auth => Check!!
                // Enabled Auth + Want to Enable Auth => No Check
                const currentDisabledAuth = await Settings.get("disableAuth");
                if (!currentDisabledAuth && data.disableAuth) {
                    await doubleCheckPassword(socket, currentPassword);
                }
                // Handle global.env
                if (data.globalENV && data.globalENV != "# VARIABLE=value #comment") {
                    await fsAsync.writeFile(path.join(server.stacksDir, "global.env"), data.globalENV);
                } else {
                    await fsAsync.rm(path.join(server.stacksDir, "global.env"), {
                        recursive: true,
                        force: true
                    });
                }
                delete data.globalENV;

                await Settings.setSettings("general", data);

                callback({
                    ok: true,
                    msg: "Saved"
                });

                server.sendInfo(socket);

            } catch (e) {
                if (e instanceof Error) {
                    callback({
                        ok: false,
                        msg: e.message,
                    });
                }
            }
        });

        // Disconnect all other socket clients of the user
        socket.on("disconnectOtherSocketClients", async () => {
            try {
                checkLogin(socket);
                server.disconnectAllSocketClients(socket.userID, socket.id);
            } catch (e) {
                if (e instanceof Error) {
                    log.warn("disconnectOtherSocketClients", e.message);
                }
            }
        });

        // composerize
        socket.on("composerize", async (dockerRunCommand : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(dockerRunCommand) !== "string") {
                    throw new ValidationError("dockerRunCommand must be a string");
                }

                // Option: 'latest' | 'v2x' | 'v3x'
                let composeTemplate = composerize(dockerRunCommand, "", "latest");

                // Remove the first line "name: <your project name>"
                composeTemplate = composeTemplate.split("\n").slice(1).join("\n");

                callback({
                    ok: true,
                    composeTemplate,
                });
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    async login(username : string, password : string) : Promise<User | null> {
        if (typeof username !== "string" || typeof password !== "string") {
            return null;
        }

        const user = await R.findOne("user", " username = ? AND active = 1 ", [
            username,
        ]) as User;

        if (user && verifyPassword(password, user.password)) {
            // Upgrade the hash to bcrypt
            if (needRehashPassword(user.password)) {
                await R.exec("UPDATE `user` SET password = ? WHERE id = ? ", [
                    generatePasswordHash(password),
                    user.id,
                ]);
            }
            return user;
        }

        return null;
    }
}
