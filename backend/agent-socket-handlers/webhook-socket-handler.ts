import { AgentSocketHandler } from "../agent-socket-handler";
import { DocketServer } from "../docket-server";
import { callbackError, callbackResult, checkLogin, DocketSocket, ValidationError } from "../util-server";
import { Stack } from "../stack";
import { AgentSocket } from "../../common/agent-socket";
import { createWebhook, deleteWebhook, getWebhookInfo, isWebhookStackName } from "../webhook";

/**
 * Manage a stack's deploy webhook. Agent events, so a manager can set up
 * webhooks for the stacks of its remote agents too.
 */
export class WebhookSocketHandler extends AgentSocketHandler {
    /**
     * Register the webhook events
     * @param {DocketSocket} socket Browser or manager socket
     * @param {DocketServer} server Server
     * @param {AgentSocket} agentSocket Agent event map
     * @returns {void}
     */
    create(socket : DocketSocket, server : DocketServer, agentSocket : AgentSocket) {
        agentSocket.on("getWebhook", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }
                callbackResult({
                    ok: true,
                    webhook: await getWebhookInfo(stackName),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("createWebhook", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof(stackName) !== "string" || !isWebhookStackName(stackName)) {
                    throw new ValidationError("This stack cannot have a webhook");
                }
                // Throws "Stack not found"
                await Stack.getStack(server, stackName);
                callbackResult({
                    ok: true,
                    token: await createWebhook(stackName),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteWebhook", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }
                await deleteWebhook(stackName);
                callbackResult({
                    ok: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}
