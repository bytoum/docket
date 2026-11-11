import "dotenv/config";
import { MainRouter } from "./routers/main-router";
import * as fs from "node:fs";
import { PackageJson } from "type-fest";
import { Database } from "./database";
import packageJSON from "../package.json";
import { log } from "./log";
import * as socketIO from "socket.io";
import express, { Express } from "express";
import { parse } from "ts-command-line-args";
import https from "https";
import http from "http";
import { Router } from "./router";
import { Socket } from "socket.io";
import { MainSocketHandler } from "./socket-handlers/main-socket-handler";
import { SocketHandler } from "./socket-handler";
import { Settings } from "./settings";
import checkVersion from "./check-version";
import dayjs from "dayjs";
import { R } from "redbean-node";
import { genSecret, isDev, LooseObject } from "../common/util-common";
import { generatePasswordHash } from "./password-hash";
import { Bean } from "redbean-node/dist/bean";
import { Arguments, Config, DocketSocket, parseSessionExpiry } from "./util-server";
import { DockerSocketHandler } from "./agent-socket-handlers/docker-socket-handler";
import expressStaticGzip from "express-static-gzip";
import path from "path";
import { TerminalSocketHandler } from "./agent-socket-handlers/terminal-socket-handler";
import { WebhookSocketHandler } from "./agent-socket-handlers/webhook-socket-handler";
import { Stack } from "./stack";
import { Cron } from "croner";
import gracefulShutdown from "http-graceful-shutdown";
import User from "./models/user";
import childProcessAsync from "promisify-child-process";
import { AgentManager } from "./agent-manager";
import { AgentProxySocketHandler } from "./socket-handlers/agent-proxy-socket-handler";
import { AgentSocketHandler } from "./agent-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import { ManageAgentSocketHandler } from "./socket-handlers/manage-agent-socket-handler";
import { UserSocketHandler } from "./socket-handlers/user-socket-handler";
import { TwoFASocketHandler } from "./socket-handlers/two-fa-socket-handler";
import { Terminal } from "./terminal";

/** A Docker network on the host */
export interface DockerNetworkDetails {
    name: string;
    driver: string;
    containers: number;
}

/** A Docker volume on the host */
export interface DockerVolumeDetails {
    name: string;
    driver: string;
    containers: number;
}

// Session lifetime when DOCKET_SESSION_EXPIRY is not set
const DEFAULT_SESSION_EXPIRY = "1d";

// Longest delay setTimeout supports
const MAX_TIMER_DELAY = 2 ** 31 - 1;

export class DocketServer {
    app : Express;
    httpServer : http.Server;
    packageJSON : PackageJson;
    io : socketIO.Server;
    config : Config;
    indexHTML : string = "";

    /**
     * List of express routers
     */
    routerList : Router[] = [
        new MainRouter(),
    ];

    /**
     * List of socket handlers (no agent support)
     */
    socketHandlerList : SocketHandler[] = [
        new MainSocketHandler(),
        new ManageAgentSocketHandler(),
        new UserSocketHandler(),
        new TwoFASocketHandler(),
    ];

    agentProxySocketHandler = new AgentProxySocketHandler();

    /**
     * List of socket handlers (support agent)
     */
    agentSocketHandlerList : AgentSocketHandler[] = [
        new DockerSocketHandler(),
        new TerminalSocketHandler(),
        new WebhookSocketHandler(),
    ];

    /**
     * Show Setup Page
     */
    needSetup = false;

    /** Session lifetime in seconds, or null when sessions never expire */
    sessionExpirySeconds : number | null = null;

    jwtSecret : string = "";

    stacksDir : string = "";

    /**
     *
     */
    constructor() {
        // Catch unexpected errors here
        let unexpectedErrorHandler = (error : unknown) => {
            console.trace(error);
            console.error("If you keep encountering errors, please report to https://github.com/bytoum/docket");
        };
        process.addListener("unhandledRejection", unexpectedErrorHandler);
        process.addListener("uncaughtException", unexpectedErrorHandler);

        if (!process.env.NODE_ENV) {
            process.env.NODE_ENV = "production";
        }

        // Log NODE ENV
        log.info("server", "NODE_ENV: " + process.env.NODE_ENV);

        // Default stacks directory
        let defaultStacksDir;
        if (process.platform === "win32") {
            defaultStacksDir = "./stacks";
        } else {
            defaultStacksDir = "/opt/stacks";
        }

        // Define all possible arguments
        let args = parse<Arguments>({
            sslKey: {
                type: String,
                optional: true,
            },
            sslCert: {
                type: String,
                optional: true,
            },
            sslKeyPassphrase: {
                type: String,
                optional: true,
            },
            port: {
                type: Number,
                optional: true,
            },
            hostname: {
                type: String,
                optional: true,
            },
            dataDir: {
                type: String,
                optional: true,
            },
            stacksDir: {
                type: String,
                optional: true,
            },
            enableConsole: {
                type: Boolean,
                optional: true,
                defaultValue: false,
            },
            sessionExpiry: {
                type: String,
                optional: true,
            },
        });

        this.config = args as Config;

        // Load from environment variables or default values if args are not set
        this.config.sslKey = args.sslKey || process.env.DOCKET_SSL_KEY || undefined;
        this.config.sslCert = args.sslCert || process.env.DOCKET_SSL_CERT || undefined;
        this.config.sslKeyPassphrase = args.sslKeyPassphrase || process.env.DOCKET_SSL_KEY_PASSPHRASE || undefined;
        this.config.port = args.port || Number(process.env.DOCKET_PORT) || 5001;
        this.config.hostname = args.hostname || process.env.DOCKET_HOSTNAME || undefined;
        this.config.dataDir = args.dataDir || process.env.DOCKET_DATA_DIR || "./data/";
        this.config.stacksDir = args.stacksDir || process.env.DOCKET_STACKS_DIR || defaultStacksDir;
        this.config.enableConsole = args.enableConsole || process.env.DOCKET_ENABLE_CONSOLE === "true" || false;
        this.config.sessionExpiry = args.sessionExpiry || process.env.DOCKET_SESSION_EXPIRY || DEFAULT_SESSION_EXPIRY;
        try {
            this.sessionExpirySeconds = parseSessionExpiry(this.config.sessionExpiry);
        } catch (e) {
            log.error("server", e instanceof Error ? e.message : String(e));
            process.exit(1);
        }
        this.stacksDir = this.config.stacksDir;

        // The DOCKGE_* variables were renamed to DOCKET_* and are no longer read
        for (const key of Object.keys(process.env)) {
            if (key.startsWith("DOCKGE_")) {
                log.warn("server", `${key} is no longer read. Rename it to ${key.replace(/^DOCKGE_/, "DOCKET_")}.`);
            }
        }

        log.debug("server", this.config);

        this.packageJSON = packageJSON as PackageJson;

        try {
            this.indexHTML = fs.readFileSync("./frontend-dist/index.html").toString();
        } catch (e) {
            // "dist/index.html" is not necessary for development
            if (process.env.NODE_ENV !== "development") {
                log.error("server", "Error: Cannot find 'frontend-dist/index.html', did you install correctly?");
                process.exit(1);
            }
        }

        // Create express
        this.app = express();

        // Create HTTP server
        if (this.config.sslKey && this.config.sslCert) {
            log.info("server", "Server Type: HTTPS");
            this.httpServer = https.createServer({
                key: fs.readFileSync(this.config.sslKey),
                cert: fs.readFileSync(this.config.sslCert),
                passphrase: this.config.sslKeyPassphrase,
            }, this.app);
        } else {
            log.info("server", "Server Type: HTTP");
            this.httpServer = http.createServer(this.app);
        }

        // Binding Routers
        for (const router of this.routerList) {
            this.app.use(router.create(this.app, this));
        }

        // Static files
        this.app.use("/", expressStaticGzip("frontend-dist", {
            enableBrotli: true,
        }));

        // Universal Route Handler, must be at the end of all express routes.
        this.app.get("*", async (_request, response) => {
            response.send(this.indexHTML);
        });

        // Allow all CORS origins in development
        let cors = undefined;
        if (isDev) {
            cors = {
                origin: "*",
            };
        }

        // Create Socket.io
        this.io = new socketIO.Server(this.httpServer, {
            cors,
            allowRequest: (req, callback) => {
                let isOriginValid = true;
                const bypass = isDev || process.env.UPTIME_KUMA_WS_ORIGIN_CHECK === "bypass";

                if (!bypass) {
                    let host = req.headers.host;

                    // If this is set, it means the request is from the browser
                    let origin = req.headers.origin;

                    // If this is from the browser, check if the origin is allowed
                    if (origin) {
                        try {
                            let originURL = new URL(origin);

                            if (host !== originURL.host) {
                                isOriginValid = false;
                                log.error("auth", `Origin (${origin}) does not match host (${host}), IP: ${req.socket.remoteAddress}`);
                            }
                        } catch (e) {
                            // Invalid origin url, probably not from browser
                            isOriginValid = false;
                            log.error("auth", `Invalid origin url (${origin}), IP: ${req.socket.remoteAddress}`);
                        }
                    } else {
                        log.info("auth", `Origin is not set, IP: ${req.socket.remoteAddress}`);
                    }
                } else {
                    log.debug("auth", "Origin check is bypassed");
                }

                callback(null, isOriginValid);
            }
        });

        this.io.on("connection", async (socket: Socket) => {
            let docketSocket = socket as DocketSocket;
            docketSocket.instanceManager = new AgentManager(docketSocket);
            docketSocket.emitAgent = (event : string, ...args : unknown[]) => {
                let obj = args[0];
                if (typeof(obj) === "object") {
                    let obj2 = obj as LooseObject;
                    obj2.endpoint = docketSocket.endpoint;
                }
                docketSocket.emit("agent", event, ...args);
            };

            if (typeof(socket.request.headers.endpoint) === "string") {
                docketSocket.endpoint = socket.request.headers.endpoint;
            } else {
                docketSocket.endpoint = "";
            }

            if (docketSocket.endpoint) {
                log.info("server", "Socket connected (agent), as endpoint " + docketSocket.endpoint);
            } else {
                log.info("server", "Socket connected (direct)");
            }

            this.sendInfo(docketSocket, true);

            if (this.needSetup) {
                log.info("server", "Redirect to setup page");
                docketSocket.emit("setup");
            }

            // Create socket handlers (original, no agent support)
            for (const socketHandler of this.socketHandlerList) {
                socketHandler.create(docketSocket, this);
            }

            // Create Agent Socket
            let agentSocket = new AgentSocket();

            // Create agent socket handlers
            for (const socketHandler of this.agentSocketHandlerList) {
                socketHandler.create(docketSocket, this, agentSocket);
            }

            // Create agent proxy socket handlers
            this.agentProxySocketHandler.create2(docketSocket, this, agentSocket);

            // ***************************
            // Better do anything after added all socket handlers here
            // ***************************

            log.debug("auth", "check auto login");
            if (await Settings.get("disableAuth")) {
                log.info("auth", "Disabled Auth: auto login to admin");
                // Log in as the owner (fall back to the first user). Never expires.
                const owner = await R.findOne("user", " is_owner = 1 ") ?? await R.findOne("user");
                this.afterLogin(docketSocket, owner as User, null);
                docketSocket.emit("autoLogin");
            } else {
                log.debug("auth", "need auth");
            }

            // Socket disconnect
            docketSocket.on("disconnect", () => {
                log.info("server", "Socket disconnected!");
                clearTimeout(docketSocket.sessionExpiryTimer);
                docketSocket.instanceManager.disconnectAll();
            });

        });

        this.io.on("disconnect", () => {

        });

        if (isDev) {
            setInterval(() => {
                log.debug("terminal", "Terminal count: " + Terminal.getTerminalCount());
            }, 5000);
        }
    }

    /**
     * Mark the socket as logged in and send it the initial data
     * @param {DocketSocket} socket Socket that logged in
     * @param {User} user User it logged in as
     * @param {number|null} expiresAt When the session ends (ms since epoch).
     * Undefined means a fresh login (now + session expiry), null means never.
     * @returns {Promise<void>}
     */
    async afterLogin(socket : DocketSocket, user : User, expiresAt? : number | null) {
        socket.userID = user.id;
        socket.join(user.id.toString());

        // Shown as "Last active" on the Users settings page
        try {
            await R.exec("UPDATE `user` SET last_active = ? WHERE id = ?", [
                dayjs.utc().format("YYYY-MM-DD HH:mm:ss"),
                user.id,
            ]);
        } catch (e) {
            log.error("server", e);
        }

        if (expiresAt === undefined && this.sessionExpirySeconds) {
            expiresAt = Date.now() + this.sessionExpirySeconds * 1000;
        }
        this.scheduleSessionExpiry(socket, expiresAt ?? null);

        this.sendInfo(socket);

        try {
            this.sendStackList();
        } catch (e) {
            log.error("server", e);
        }

        socket.instanceManager.sendAgentList();

        // Also connect to other Docket instances
        socket.instanceManager.connectAll();
    }

    /**
     *
     */
    async serve() {
        // Create all the necessary directories
        this.initDataDir();

        // Connect to database
        try {
            await Database.init(this);
        } catch (e) {
            if (e instanceof Error) {
                log.error("server", "Failed to prepare your database: " + e.message);
            }
            process.exit(1);
        }

        // First time setup if needed
        let jwtSecretBean = await R.findOne("setting", " `key` = ? ", [
            "jwtSecret",
        ]);

        if (! jwtSecretBean) {
            log.info("server", "JWT secret is not found, generate one.");
            jwtSecretBean = await this.initJWTSecret();
            log.info("server", "Stored JWT secret into database");
        } else {
            log.debug("server", "Load JWT secret from database.");
        }

        this.jwtSecret = jwtSecretBean.value;

        const userCount = (await R.knex("user").count("id as count").first()).count;

        log.debug("server", "User count: " + userCount);

        // If there is no record in user table, it is a new Docket instance, need to setup
        if (userCount == 0) {
            log.info("server", "No user, need setup");
            this.needSetup = true;
        }

        // Listen
        this.httpServer.listen(this.config.port, this.config.hostname, () => {
            if (this.config.hostname) {
                log.info( "server", `Listening on ${this.config.hostname}:${this.config.port}`);
            } else {
                log.info("server", `Listening on ${this.config.port}`);
            }

            // Run every 10 seconds
            Cron("*/10 * * * * *", {
                protect: true,  // Enabled over-run protection.
            }, () => {
                //log.debug("server", "Cron job running");
                this.sendStackList(true);
            });

            checkVersion.startInterval();
        });

        gracefulShutdown(this.httpServer, {
            signals: "SIGINT SIGTERM",
            timeout: 30000,                   // timeout: 30 secs
            development: false,               // not in dev mode
            forceExit: true,                  // triggers process.exit() at the end of shutdown process
            onShutdown: this.shutdownFunction,     // shutdown function (async) - e.g. for cleanup DB, ...
            finally: this.finalFunction,            // finally function (sync) - e.g. for logging
        });

    }

    /**
     * Emits the version information to the client.
     * @param socket Socket.io socket instance
     * @param hideVersion Should we hide the version information in the response?
     * @returns
     */
    async sendInfo(socket : Socket, hideVersion = false) {
        let versionProperty;
        let latestVersionProperty;
        let isContainer;

        if (!hideVersion) {
            versionProperty = packageJSON.version;
            latestVersionProperty = checkVersion.latestVersion;
            isContainer = (process.env.DOCKET_IS_CONTAINER === "1");
        }

        socket.emit("info", {
            version: versionProperty,
            latestVersion: latestVersionProperty,
            isContainer,
            primaryHostname: await Settings.get("primaryHostname"),
            //serverTimezone: await this.getTimezone(),
            //serverTimezoneOffset: this.getTimezoneOffset(),
        });
    }

    /**
     * Get the IP of the client connected to the socket
     * @param {Socket} socket Socket to query
     * @returns IP of client
     */
    async getClientIP(socket : Socket) : Promise<string> {
        let clientIP = socket.client.conn.remoteAddress;

        if (clientIP === undefined) {
            clientIP = "";
        }

        if (await Settings.get("trustProxy")) {
            const forwardedFor = socket.client.conn.request.headers["x-forwarded-for"];

            if (typeof forwardedFor === "string") {
                return forwardedFor.split(",")[0].trim();
            } else if (typeof socket.client.conn.request.headers["x-real-ip"] === "string") {
                return socket.client.conn.request.headers["x-real-ip"];
            }
        }
        return clientIP.replace(/^::ffff:/, "");
    }

    /**
     * Attempt to get the current server timezone
     * If this fails, fall back to environment variables and then make a
     * guess.
     * @returns {Promise<string>} Current timezone
     */
    async getTimezone() {
        // From process.env.TZ
        try {
            if (process.env.TZ) {
                this.checkTimezone(process.env.TZ);
                return process.env.TZ;
            }
        } catch (e) {
            if (e instanceof Error) {
                log.warn("timezone", e.message + " in process.env.TZ");
            }
        }

        const timezone = await Settings.get("serverTimezone");

        // From Settings
        try {
            log.debug("timezone", "Using timezone from settings: " + timezone);
            if (timezone) {
                this.checkTimezone(timezone);
                return timezone;
            }
        } catch (e) {
            if (e instanceof Error) {
                log.warn("timezone", e.message + " in settings");
            }
        }

        // Guess
        try {
            const guess = dayjs.tz.guess();
            log.debug("timezone", "Guessing timezone: " + guess);
            if (guess) {
                this.checkTimezone(guess);
                return guess;
            } else {
                return "UTC";
            }
        } catch (e) {
            // Guess failed, fall back to UTC
            log.debug("timezone", "Guessed an invalid timezone. Use UTC as fallback");
            return "UTC";
        }
    }

    /**
     * Get the current offset
     * @returns {string} Time offset
     */
    getTimezoneOffset() {
        return dayjs().format("Z");
    }

    /**
     * Throw an error if the timezone is invalid
     * @param {string} timezone Timezone to test
     * @returns {void}
     * @throws The timezone is invalid
     */
    checkTimezone(timezone : string) {
        try {
            dayjs.utc("2013-11-18 11:55").tz(timezone).format();
        } catch (e) {
            throw new Error("Invalid timezone:" + timezone);
        }
    }

    /**
     * Initialize the data directory
     */
    initDataDir() {
        if (! fs.existsSync(this.config.dataDir)) {
            fs.mkdirSync(this.config.dataDir, { recursive: true });
        }

        // Check if a directory
        if (!fs.lstatSync(this.config.dataDir).isDirectory()) {
            throw new Error(`Fatal error: ${this.config.dataDir} is not a directory`);
        }

        // Create data/stacks directory
        if (!fs.existsSync(this.stacksDir)) {
            fs.mkdirSync(this.stacksDir, { recursive: true });
        }

        log.info("server", `Data Dir: ${this.config.dataDir}`);
    }

    /**
     * Init or reset JWT secret
     * @returns  JWT secret
     */
    async initJWTSecret() : Promise<Bean> {
        let jwtSecretBean = await R.findOne("setting", " `key` = ? ", [
            "jwtSecret",
        ]);

        if (!jwtSecretBean) {
            jwtSecretBean = R.dispense("setting");
            jwtSecretBean.key = "jwtSecret";
        }

        jwtSecretBean.value = generatePasswordHash(genSecret());
        await R.store(jwtSecretBean);
        return jwtSecretBean;
    }

    /**
     * Send stack list to all connected sockets
     * @param useCache
     */
    async sendStackList(useCache = false) {
        let socketList = this.io.sockets.sockets.values();

        let stackList;

        for (let socket of socketList) {
            let docketSocket = socket as DocketSocket;

            // Check if the room is a number (user id)
            if (docketSocket.userID) {

                // Get the list only if there is a logged in user
                if (!stackList) {
                    stackList = await Stack.getStackList(this, useCache);
                }

                let map : Map<string, object> = new Map();

                for (let [ stackName, stack ] of stackList) {
                    map.set(stackName, stack.toSimpleJSON(docketSocket.endpoint));
                }

                log.debug("server", "Send stack list to user: " + docketSocket.id + " (" + docketSocket.endpoint + ")");
                docketSocket.emitAgent("stackList", {
                    ok: true,
                    stackList: Object.fromEntries(map),
                });
            }
        }
    }

    async getDockerNetworkList() : Promise<string[]> {
        let res = await childProcessAsync.spawn("docker", [ "network", "ls", "--format", "{{.Name}}" ], {
            encoding: "utf-8",
        });

        if (!res.stdout) {
            return [];
        }

        let list = res.stdout.toString().split("\n");

        // Remove empty string item
        list = list.filter((item) => {
            return item !== "";
        }).sort((a, b) => {
            return a.localeCompare(b);
        });

        return list;
    }

    /**
     * List the Docker networks on this host with their driver and how many
     * containers are attached to each
     * @returns {Promise<DockerNetworkDetails[]>} Networks sorted by name
     */
    async getDockerNetworkDetails() : Promise<DockerNetworkDetails[]> {
        const names = await this.getDockerNetworkList();
        if (names.length === 0) {
            return [];
        }

        const res = await childProcessAsync.spawn("docker", [ "network", "inspect", "--format", "{{.Name}}\t{{.Driver}}\t{{len .Containers}}", ...names ], {
            encoding: "utf-8",
        });

        const details = new Map<string, DockerNetworkDetails>();
        for (const line of (res.stdout ?? "").toString().split("\n")) {
            const [ name, driver, containers ] = line.split("\t");
            if (name) {
                details.set(name, {
                    name,
                    driver: driver ?? "",
                    containers: Number.parseInt(containers ?? "0", 10) || 0,
                });
            }
        }

        // Keep every listed network, even if inspect skipped it
        return names.map((name) => details.get(name) ?? {
            name,
            driver: "",
            containers: 0,
        });
    }

    /**
     * List the Docker volumes on this host with their driver and how many
     * containers (running or not) mount each one
     * @returns {Promise<DockerVolumeDetails[]>} Volumes sorted by name
     */
    async getDockerVolumeDetails() : Promise<DockerVolumeDetails[]> {
        const res = await childProcessAsync.spawn("docker", [ "volume", "ls", "--format", "{{.Name}}\t{{.Driver}}" ], {
            encoding: "utf-8",
        });

        const volumes : DockerVolumeDetails[] = [];
        for (const line of (res.stdout ?? "").toString().split("\n")) {
            const [ name, driver ] = line.split("\t");
            if (name) {
                volumes.push({
                    name,
                    driver: driver ?? "",
                    containers: 0,
                });
            }
        }
        if (volumes.length === 0) {
            return [];
        }

        // One call for all containers: each line is a container's mount names, comma separated
        const mountsRes = await childProcessAsync.spawn("docker", [ "ps", "--all", "--no-trunc", "--format", "{{.Mounts}}" ], {
            encoding: "utf-8",
        });
        const counts = new Map<string, number>();
        for (const line of (mountsRes.stdout ?? "").toString().split("\n")) {
            for (const mount of new Set(line.split(",").map((item) => item.trim()).filter((item) => item !== ""))) {
                counts.set(mount, (counts.get(mount) ?? 0) + 1);
            }
        }

        for (const volume of volumes) {
            volume.containers = counts.get(volume.name) ?? 0;
        }
        return volumes.sort((a, b) => a.name.localeCompare(b.name));
    }

    async getDockerStats() : Promise<Map<string, object>> {
        let stats = new Map<string, object>();

        try {
            let res = await childProcessAsync.spawn("docker", [ "stats", "--format", "json", "--no-stream" ], {
                encoding: "utf-8",
            });

            if (!res.stdout) {
                return stats;
            }

            let lines = res.stdout?.toString().split("\n");

            for (let line of lines) {
                try {
                    let obj = JSON.parse(line);
                    stats.set(obj.Name, obj);
                } catch (e) {
                }
            }

            return stats;
        } catch (e) {
            log.error("getDockerStats", e);
            return stats;
        }
    }

    get stackDirFullPath() {
        return path.resolve(this.stacksDir);
    }

    /**
     * Shutdown the application
     * Stops all monitors and closes the database connection.
     * @param signal The signal that triggered this function to be called.
     */
    async shutdownFunction(signal : string | undefined) {
        log.info("server", "Shutdown requested");
        log.info("server", "Called signal: " + signal);

        // TODO: Close all terminals?

        await Database.close();
        Settings.stopCacheCleaner();
    }

    /**
     * Final function called before application exits
     */
    finalFunction() {
        log.info("server", "Graceful shutdown successful!");
    }

    /**
     * Log the socket out when its session ends: the browser refreshes, its
     * token is rejected and the login page shows. setTimeout cannot wait
     * more than ~24.8 days, so long sessions are timed in steps.
     * @param {DocketSocket} socket Logged-in socket
     * @param {number|null} expiresAt When the session ends (ms since epoch), or null for never
     * @returns {void}
     */
    scheduleSessionExpiry(socket : DocketSocket, expiresAt : number | null) {
        clearTimeout(socket.sessionExpiryTimer);
        socket.sessionExpiryTimer = undefined;
        if (expiresAt === null) {
            return;
        }

        const delay = expiresAt - Date.now();
        if (delay <= 0) {
            log.info("auth", `Session expired for user ID ${socket.userID}`);
            socket.emit("refresh");
            socket.disconnect();
            return;
        }

        socket.sessionExpiryTimer = setTimeout(() => {
            this.scheduleSessionExpiry(socket, expiresAt);
        }, Math.min(delay, MAX_TIMER_DELAY));
    }

    /**
     * Force connected sockets of a user to refresh and disconnect.
     * Used for resetting password.
     * @param {string} userID
     * @param {string?} currentSocketID
     */
    disconnectAllSocketClients(userID: number | undefined, currentSocketID? : string) {
        for (const rawSocket of this.io.sockets.sockets.values()) {
            let socket = rawSocket as DocketSocket;
            if ((!userID || socket.userID === userID) && socket.id !== currentSocketID) {
                try {
                    socket.emit("refresh");
                    socket.disconnect();
                } catch (e) {

                }
            }
        }
    }

    isSSL() {
        return this.config.sslKey && this.config.sslCert;
    }

    getLocalWebSocketURL() {
        const protocol = this.isSSL() ? "wss" : "ws";
        const host = this.config.hostname || "localhost";
        return `${protocol}://${host}:${this.config.port}`;
    }

}
