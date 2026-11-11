import { DocketServer } from "../docket-server";
import { Router } from "../router";
import express, { Express, Response, Router as ExpressRouter } from "express";
import { log } from "../log";
import { Stack } from "../stack";
import { TERMINAL_BUSY_MESSAGE } from "../terminal";
import { webhookRateLimiter } from "../rate-limiter";
import { findWebhookTarget, recordWebhookResult, WebhookResult } from "../webhook";

/**
 * POST /api/webhook/:token runs the Update of the token's stack, or of one
 * of its services (pull, then recreate if the stack is running) and answers when it is done. Meant for a CI step such
 * as GitHub Actions. The reply never includes terminal output.
 */
export class WebhookRouter extends Router {
    /**
     * @param {Express} app Express app
     * @param {DocketServer} server Server
     * @returns {ExpressRouter} Router
     */
    create(app : Express, server : DocketServer) : ExpressRouter {
        const router = express.Router();

        router.post("/api/webhook/:token", async (req, res) => {
            try {
                await this.handle(server, req.params.token, res);
            } catch (e) {
                log.error("webhook", "Unexpected error: " + (e instanceof Error ? e.message : e));
                if (!res.headersSent) {
                    res.status(500).json({
                        ok: false,
                        msg: "Internal error",
                    });
                }
            }
        });

        // Anything else under /api/webhook is not found, not the frontend
        router.all("/api/webhook/*", (_req, res) => {
            res.status(404).json({
                ok: false,
                msg: "Not found",
            });
        });

        return router;
    }

    /**
     * Run one webhook request
     * @param {DocketServer} server Server
     * @param {string} token Raw token from the URL
     * @param {Response} res Express response
     * @returns {Promise<void>}
     */
    async handle(server : DocketServer, token : string, res : Response) : Promise<void> {
        // Only unknown tokens count toward the limit, so strangers sending
        // junk cannot block a real CI call
        const target = await findWebhookTarget(token);
        if (!target) {
            if (await webhookRateLimiter.removeTokens(1) < 0) {
                res.status(429).json({
                    ok: false,
                    msg: "Too many requests",
                });
                return;
            }
            res.status(404).json({
                ok: false,
                msg: "Not found",
            });
            return;
        }

        let stack : Stack;
        try {
            stack = await Stack.getStack(server, target.stackName);
        } catch (e) {
            res.status(404).json({
                ok: false,
                msg: "Stack not found",
            });
            return;
        }

        const { stackName, serviceName } = target;
        if (serviceName !== "" && !stack.hasService(serviceName)) {
            res.status(404).json({
                ok: false,
                msg: "Service not found",
            });
            return;
        }

        let status : number;
        let result : WebhookResult;
        let msg : string;
        try {
            if (serviceName === "") {
                await stack.update(undefined);
            } else {
                await stack.updateService(undefined, serviceName);
            }
            status = 200;
            result = "success";
            msg = "Updated";
        } catch (e) {
            // Terminal.exec rejects with a plain string when the stack is busy
            msg = e instanceof Error ? e.message : String(e);
            if (msg === TERMINAL_BUSY_MESSAGE) {
                status = 409;
                result = "busy";
            } else {
                status = 500;
                result = "failed";
            }
        }

        await recordWebhookResult(target, result);
        const what = serviceName === "" ? "stack " + stackName : "service " + serviceName + " of stack " + stackName;
        log.info("webhook", "Webhook triggered for " + what + ": " + result);
        server.sendStackList();

        if (status === 200) {
            res.status(200).json({
                ok: true,
                msg,
                stack: stackName,
                ...(serviceName !== "" ? { service: serviceName } : {}),
            });
        } else {
            res.status(status).json({
                ok: false,
                msg,
            });
        }
    }
}
