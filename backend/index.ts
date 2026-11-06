import { DockgeServer } from "./dockge-server";
import { log } from "./log";

log.info("server", "Welcome to Docket!");
const server = new DockgeServer();
await server.serve();
