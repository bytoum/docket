import * as OTPAuth from "otpauth";
import { R } from "redbean-node";

const ISSUER = "Docket";

/**
 * Build a TOTP instance with Docket's fixed parameters.
 * @param secret Base32 secret
 * @param username Account label
 * @returns TOTP instance
 */
function createTOTP(secret: string, username = ""): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
        issuer: ISSUER,
        label: username,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
    });
}

/**
 * Generate a new random 20-byte TOTP secret.
 * @returns Base32 encoded secret
 */
export function generateSecret(): string {
    return new OTPAuth.Secret({ size: 20 }).base32;
}

/**
 * Build the otpauth:// URI that authenticator apps read from a QR code.
 * @param secret Base32 secret
 * @param username Account label shown in the authenticator app
 * @returns otpauth URI
 */
export function buildURI(secret: string, username: string): string {
    return createTOTP(secret, username).toString();
}

/**
 * Check a TOTP code, allowing one 30 second step either side.
 * @param token Code entered by the user
 * @param secret Base32 secret, or empty when 2FA is not set up
 * @returns True if the code is valid
 */
export function verifyToken(token: unknown, secret: string | null | undefined): boolean {
    if (typeof token !== "string" || typeof secret !== "string" || secret === "") {
        return false;
    }
    const code = token.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
        return false;
    }
    return createTOTP(secret).validate({
        token: code,
        window: 1,
    }) !== null;
}

/**
 * Turn 2FA off for a user and forget the secret and last used code.
 * @param userID ID of the user
 * @returns Resolves when the user row is updated
 */
export async function clearTwoFA(userID: number): Promise<void> {
    await R.exec("UPDATE `user` SET twofa_status = 0, twofa_secret = NULL, twofa_last_token = NULL WHERE id = ?", [
        userID,
    ]);
}
