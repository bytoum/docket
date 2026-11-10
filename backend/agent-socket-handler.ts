import { DocketServer } from "./docket-server";
import { AgentSocket } from "../common/agent-socket";
import { DocketSocket } from "./util-server";

export abstract class AgentSocketHandler {
    abstract create(socket : DocketSocket, server : DocketServer, agentSocket : AgentSocket): void;
}
