/*
 * Deploy webhooks: secret URLs that run a stack's Update (pull, then recreate
 * if running), either for the whole stack or for one of its services. Only
 * the SHA-256 hash of a token is stored.
 */
import crypto from "crypto";
import dayjs from "dayjs";
import { R } from "redbean-node";

export type WebhookResult = "success" | "failed" | "busy";

export interface WebhookTarget {
    stackName : string;
    /** "" for a whole-stack webhook */
    serviceName : string;
}

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
 * A stored UTC time as ISO 8601, so browsers read it in their own time zone
 * @param {unknown} value Database value
 * @returns {string | null} ISO string, or null when empty
 */
function toISO(value : unknown) : string | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    return dayjs.utc(value as string).toISOString();
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
 * Whether a string is a valid Compose service name
 * @param {string} name Service name
 * @returns {boolean} True when valid
 */
export function isWebhookServiceName(name : string) : boolean {
    return /^[a-zA-Z0-9._-]+$/.test(name) && name !== "." && name !== "..";
}

/**
 * Create a webhook, or replace it so the old URL stops working
 * @param {string} stackName Stack name
 * @param {string} serviceName Service to update, or "" for the whole stack
 * @returns {Promise<string>} The raw token, shown to the user once
 */
export async function createWebhook(stackName : string, serviceName = "") : Promise<string> {
    const token = crypto.randomBytes(32).toString("base64url");
    await R.exec("DELETE FROM webhook WHERE stack_name = ? AND service_name = ?", [ stackName, serviceName ]);
    await R.exec("INSERT INTO webhook (stack_name, service_name, token_hash, created_date) VALUES (?, ?, ?, ?)", [
        stackName,
        serviceName,
        hashWebhookToken(token),
        nowUTC(),
    ]);
    return token;
}

/**
 * A webhook, without its token
 * @param {string} stackName Stack name
 * @param {string} serviceName Service name, or "" for the stack's own webhook
 * @returns {Promise<WebhookInfo | null>} Null when there is none
 */
export async function getWebhookInfo(stackName : string, serviceName = "") : Promise<WebhookInfo | null> {
    const row = await R.getRow("SELECT created_date, last_triggered, last_result FROM webhook WHERE stack_name = ? AND service_name = ?", [ stackName, serviceName ]);
    if (!row) {
        return null;
    }
    return {
        createdDate: toISO(row.created_date) ?? "",
        lastTriggered: toISO(row.last_triggered),
        lastResult: row.last_result ?? null,
    };
}

/**
 * Delete a webhook, if it exists
 * @param {string} stackName Stack name
 * @param {string} serviceName Service name, or "" for the stack's own webhook
 * @returns {Promise<void>}
 */
export async function deleteWebhook(stackName : string, serviceName = "") : Promise<void> {
    await R.exec("DELETE FROM webhook WHERE stack_name = ? AND service_name = ?", [ stackName, serviceName ]);
}

/**
 * Delete every webhook of a stack, its own and its containers'
 * @param {string} stackName Stack name
 * @returns {Promise<void>}
 */
export async function deleteStackWebhooks(stackName : string) : Promise<void> {
    await R.exec("DELETE FROM webhook WHERE stack_name = ?", [ stackName ]);
}

/**
 * What a webhook token updates
 * @param {string} token Raw token from the URL
 * @returns {Promise<WebhookTarget | null>} Stack and service ("" for the whole stack), or null for an unknown token
 */
export async function findWebhookTarget(token : string) : Promise<WebhookTarget | null> {
    const row = await R.getRow("SELECT stack_name, service_name FROM webhook WHERE token_hash = ?", [ hashWebhookToken(token) ]);
    if (!row) {
        return null;
    }
    return {
        stackName: row.stack_name,
        serviceName: row.service_name ?? "",
    };
}

/**
 * Record a webhook run. Matches by stack and service, so a webhook
 * regenerated or deleted during the run is simply updated or left alone.
 * @param {WebhookTarget} target Stack and service
 * @param {WebhookResult} result Outcome of the run
 * @returns {Promise<void>}
 */
export async function recordWebhookResult(target : WebhookTarget, result : WebhookResult) : Promise<void> {
    await R.exec("UPDATE webhook SET last_triggered = ?, last_result = ? WHERE stack_name = ? AND service_name = ?", [
        nowUTC(),
        result,
        target.stackName,
        target.serviceName,
    ]);
}
