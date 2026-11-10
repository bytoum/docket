import { SocketHandler } from "../socket-handler.js";
import { DocketServer } from "../docket-server";
import { R } from "redbean-node";
import { twoFaRateLimiter } from "../rate-limiter";
import { callbackError, callbackResult, checkLogin, DocketSocket, doubleCheckPassword } from "../util-server";
import { buildURI, clearTwoFA, generateSecret, verifyToken } from "../two-fa";

/**
 * Self-service two-factor authentication: a user turns their own 2FA on and off.
 * Every event that changes or reveals 2FA data asks for the current password.
 * Local only, not proxied to agents.
 */
export class TwoFASocketHandler extends SocketHandler {

    /**
     * Register the 2FA events on a socket.
     * @param socket Browser socket
     * @param server Docket server
     */
    create(socket : DocketSocket, server : DocketServer) {

        // Is 2FA on for the current user?
        socket.on("twoFAStatus", async (callback : unknown) => {
            try {
                checkLogin(socket);

                const user = await R.findOne("user", " id = ? AND active = 1 ", [ socket.userID ]);

                callbackResult({
                    ok: true,
                    status: !!user?.twofa_status,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Start setup: keep (or create) a pending secret and return its URI
        socket.on("prepare2FA", async (currentPassword : unknown, callback : unknown) => {
            try {
                checkLogin(socket);
                const user = await doubleCheckPassword(socket, currentPassword);

                if (user.twofa_status) {
                    throw new Error("twoFAAlreadyEnabled");
                }

                let secret = user.twofa_secret;
                if (!secret) {
                    secret = generateSecret();
                    await R.exec("UPDATE `user` SET twofa_secret = ? WHERE id = ?", [ secret, user.id ]);
                }

                callbackResult({
                    ok: true,
                    uri: buildURI(secret, user.username),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Check a code against the stored secret, to confirm the authenticator app works
        socket.on("verifyToken", async (token : unknown, currentPassword : unknown, callback : unknown) => {
            try {
                if (!await twoFaRateLimiter.pass(callback as never)) {
                    return;
                }
                checkLogin(socket);
                const user = await doubleCheckPassword(socket, currentPassword);

                callbackResult({
                    ok: true,
                    valid: verifyToken(token, user.twofa_secret),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Turn 2FA on, using the secret stored by prepare2FA
        socket.on("save2FA", async (currentPassword : unknown, callback : unknown) => {
            try {
                checkLogin(socket);
                const user = await doubleCheckPassword(socket, currentPassword);

                if (user.twofa_status) {
                    throw new Error("twoFAAlreadyEnabled");
                }
                if (!user.twofa_secret) {
                    throw new Error("twoFANotPrepared");
                }

                await R.exec("UPDATE `user` SET twofa_status = 1, twofa_last_token = NULL WHERE id = ?", [ user.id ]);

                callbackResult({
                    ok: true,
                    msg: "twoFAEnabled",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Turn 2FA off and forget the secret
        socket.on("disable2FA", async (currentPassword : unknown, callback : unknown) => {
            try {
                checkLogin(socket);
                const user = await doubleCheckPassword(socket, currentPassword);

                await clearTwoFA(user.id);

                callbackResult({
                    ok: true,
                    msg: "twoFADisabled",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}
