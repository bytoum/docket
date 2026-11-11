/*
 * Deploy webhooks: one secret URL per stack that runs the stack's Update
 * (pull, then recreate if running). Only the SHA-256 hash of a token is stored.
 */
import crypto from "crypto";
import dayjs from "dayjs";
import { R } from "redbean-node";

export type WebhookResult = "success" | "failed" | "busy";

export interface WebhookInfo {
    createdDate : string;
    lastTriggered : string | null;
    lastResult : WebhookResult | null;
}

/**
 * Current time in UTC, in the format the database stores
 * @returns {string} "YYYY-MM-DD HH:mm:ss"
 */
function nowUTC() : string {
    return dayjs.utc().format("YYYY-MM-DD HH:mm:ss");
}

/**
 * Hash a webhook token for storage and lookup
 * @param {string} token Raw token from the URL
 * @returns {string} SHA-256 hex digest
 */
export function hashWebhookToken(token : string) : string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Whether a stack can have a webhook: a valid stack name, and not Docket's
 * own stack (redeploying it would kill the request partway through)
 * @param {string} name Stack name
 * @returns {boolean} True when allowed
 */
export function isWebhookStackName(name : string) : boolean {
    return /^[a-z0-9_-]+$/.test(name) && name !== "docket" && name !== "dockge";
}

/**
 * Create the stack's webhook, or replace it so the old URL stops working
 * @param {string} stackName Stack name
 * @returns {Promise<string>} The raw token, shown to the user once
 */
export async function createWebhook(stackName : string) : Promise<string> {
    const token = crypto.randomBytes(32).toString("base64url");
    await R.exec("DELETE FROM webhook WHERE stack_name = ?", [ stackName ]);
    await R.exec("INSERT INTO webhook (stack_name, token_hash, created_date) VALUES (?, ?, ?)", [
        stackName,
        hashWebhookToken(token),
        nowUTC(),
    ]);
    return token;
}

/**
 * The stack's webhook, without its token
 * @param {string} stackName Stack name
 * @returns {Promise<WebhookInfo | null>} Null when the stack has none
 */
export async function getWebhookInfo(stackName : string) : Promise<WebhookInfo | null> {
    const row = await R.getRow("SELECT created_date, last_triggered, last_result FROM webhook WHERE stack_name = ?", [ stackName ]);
    if (!row) {
        return null;
    }
    return {
        createdDate: row.created_date,
        lastTriggered: row.last_triggered ?? null,
        lastResult: row.last_result ?? null,
    };
}

/**
 * Delete the stack's webhook, if it has one
 * @param {string} stackName Stack name
 * @returns {Promise<void>}
 */
export async function deleteWebhook(stackName : string) : Promise<void> {
    await R.exec("DELETE FROM webhook WHERE stack_name = ?", [ stackName ]);
}

/**
 * The stack a webhook token belongs to
 * @param {string} token Raw token from the URL
 * @returns {Promise<string | null>} Stack name, or null for an unknown token
 */
export async function findWebhookStackName(token : string) : Promise<string | null> {
    const row = await R.getRow("SELECT stack_name FROM webhook WHERE token_hash = ?", [ hashWebhookToken(token) ]);
    return row?.stack_name ?? null;
}

/**
 * Record a webhook run. Matches by stack name, so a webhook regenerated or
 * deleted during the run is simply updated or left alone.
 * @param {string} stackName Stack name
 * @param {WebhookResult} result Outcome of the run
 * @returns {Promise<void>}
 */
export async function recordWebhookResult(stackName : string, result : WebhookResult) : Promise<void> {
    await R.exec("UPDATE webhook SET last_triggered = ?, last_result = ? WHERE stack_name = ?", [
        nowUTC(),
        result,
        stackName,
    ]);
}
