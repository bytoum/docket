import { AgentSocketHandler } from "../agent-socket-handler";
import { DocketServer } from "../docket-server";
import { callbackError, callbackResult, checkLogin, DocketSocket, ValidationError } from "../util-server";
import { Stack } from "../stack";
import { AgentSocket } from "../../common/agent-socket";
import { createWebhook, deleteWebhook, getWebhookInfo, isWebhookServiceName, isWebhookStackName } from "../webhook";

/**
 * Split the optional service name from the callback. Callers without a
 * service (whole-stack webhooks, older managers) send only the callback.
 * @param {unknown[]} rest Arguments after the stack name
 * @returns {{ serviceName: unknown, callback: unknown }} Service name ("" when absent) and callback
 */
function splitServiceArg(rest : unknown[]) : { serviceName : unknown, callback : unknown } {
    if (rest.length >= 2) {
        return {
            serviceName: rest[0],
            callback: rest[rest.length - 1],
        };
    }
    return {
        serviceName: "",
        callback: rest[0],
    };
}

/**
 * Check the stack and service names of a webhook event
 * @param {unknown} stackName Stack name
 * @param {unknown} serviceName Service name, "" for the whole stack
 * @returns {void}
 */
function validateNames(stackName : unknown, serviceName : unknown) : asserts stackName is string {
    if (typeof(stackName) !== "string") {
        throw new ValidationError("Stack name must be a string");
    }
    if (typeof(serviceName) !== "string" || (serviceName !== "" && !isWebhookServiceName(serviceName))) {
        throw new ValidationError("Invalid service name");
    }
}

/**
 * Manage deploy webhooks, for a whole stack or one of its services. Agent
 * events, so a manager can set up webhooks for the stacks of its remote
 * agents too.
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
        agentSocket.on("getWebhook", async (stackName : unknown, ...rest : unknown[]) => {
            const { serviceName, callback } = splitServiceArg(rest);
            try {
                checkLogin(socket);
                validateNames(stackName, serviceName);
                callbackResult({
                    ok: true,
                    webhook: await getWebhookInfo(stackName, serviceName as string),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("createWebhook", async (stackName : unknown, ...rest : unknown[]) => {
            const { serviceName, callback } = splitServiceArg(rest);
            try {
                checkLogin(socket);
                validateNames(stackName, serviceName);
                if (!isWebhookStackName(stackName)) {
                    throw new ValidationError("This stack cannot have a webhook");
                }
                // Throws "Stack not found"
                const stack = await Stack.getStack(server, stackName);
                if (serviceName !== "" && !stack.hasService(serviceName as string)) {
                    throw new ValidationError("Service not found");
                }
                callbackResult({
                    ok: true,
                    token: await createWebhook(stackName, serviceName as string),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteWebhook", async (stackName : unknown, ...rest : unknown[]) => {
            const { serviceName, callback } = splitServiceArg(rest);
            try {
                checkLogin(socket);
                validateNames(stackName, serviceName);
                await deleteWebhook(stackName, serviceName as string);
                callbackResult({
                    ok: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}
