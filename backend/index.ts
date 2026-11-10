import { DocketServer } from "./docket-server";
import { log } from "./log";

log.info("server", "Welcome to Docket!");
const server = new DocketServer();
await server.serve();
