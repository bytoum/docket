import { DocketServer } from "./docket-server";
import { DocketSocket } from "./util-server";

export abstract class SocketHandler {
    abstract create(socket : DocketSocket, server : DocketServer): void;
}
