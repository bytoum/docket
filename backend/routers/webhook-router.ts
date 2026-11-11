import { DocketServer } from "../docket-server";
import { Router } from "../router";
import express, { Express, Response, Router as ExpressRouter } from "express";
import { log } from "../log";
import { Stack } from "../stack";
import { TERMINAL_BUSY_MESSAGE } from "../terminal";
import { webhookRateLimiter } from "../rate-limiter";
import { findWebhookStackName, recordWebhookResult, WebhookResult } from "../webhook";

/**
 * POST /api/webhook/:token runs the Update of the token's stack (pull, then
 * recreate if running) and answers when it is done. Meant for a CI step such
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
        if (await webhookRateLimiter.removeTokens(1) < 0) {
            res.status(429).json({
                ok: false,
                msg: "Too many requests",
            });
            return;
        }

        const stackName = await findWebhookStackName(token);
        if (!stackName) {
            res.status(404).json({
                ok: false,
                msg: "Not found",
            });
            return;
        }

        let stack : Stack;
        try {
            stack = await Stack.getStack(server, stackName);
        } catch (e) {
            res.status(404).json({
                ok: false,
                msg: "Stack not found",
            });
            return;
        }

        let status : number;
        let result : WebhookResult;
        let msg : string;
        try {
            await stack.update(undefined);
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

        await recordWebhookResult(stackName, result);
        log.info("webhook", "Webhook triggered for stack " + stackName + ": " + result);
        server.sendStackList();

        if (status === 200) {
            res.status(200).json({
                ok: true,
                msg,
                stack: stackName,
            });
        } else {
            res.status(status).json({
                ok: false,
                msg,
            });
        }
    }
}
