import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { RoomManager } from "./rooms.js";
import { ROOM_ID_REGEX } from "./config.js";
import type { ClientMessage, ServerMessage } from "./types.js";

export function registerSignaling(app: FastifyInstance, rooms: RoomManager) {
  app.get("/ws", { websocket: true }, (socket: WebSocket) => {
    let clientId: string | null = null;

    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    };

    const sendError = (
      code: import("./types.js").ErrorCode,
      message: string,
    ) => send({ type: "error", code, message });

    socket.on("message", (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendError("invalid-message", "Malformed JSON");
        return;
      }

      switch (msg.type) {
        case "join": {
          if (clientId) {
            sendError("already-joined", "This connection is already in a room");
            return;
          }
          if (!ROOM_ID_REGEX.test(msg.roomId)) {
            sendError("invalid-room", "Room ID is malformed");
            return;
          }
          const result = rooms.join(msg.roomId, send);
          if (!result.ok) {
            sendError(result.error, describeError(result.error));
            return;
          }
          clientId = result.client.id;
          send({
            type: "joined",
            roomId: msg.roomId,
            self: result.client.id,
            token: result.client.token,
            peers: result.peers.map((p) => p.id),
          });
          for (const peer of result.peers) {
            if (peer.connected) {
              peer.send({ type: "peer-joined", peerId: result.client.id });
            }
          }
          break;
        }

        case "resume": {
          if (clientId) {
            sendError("already-joined", "This connection is already in a room");
            return;
          }
          const result = rooms.resume(msg.token, send);
          if (!result.ok) {
            sendError(result.error, "Session expired or invalid");
            return;
          }
          clientId = result.client.id;
          send({
            type: "resumed",
            roomId: result.client.roomId,
            self: result.client.id,
            peers: result.peers.map((p) => p.id),
          });
          break;
        }

        case "signal": {
          if (!clientId) {
            sendError("not-in-room", "Join a room before signaling");
            return;
          }
          const result = rooms.routeSignal(clientId, msg.to, msg.payload);
          if (result === "peer-not-found") {
            sendError("peer-not-found", "Peer not in this room");
          }
          break;
        }

        case "leave": {
          if (clientId) {
            rooms.leave(clientId);
            clientId = null;
          }
          break;
        }

        case "ping": {
          if (clientId) rooms.touch(clientId);
          send({ type: "pong" });
          break;
        }

        default: {
          sendError("invalid-message", "Unknown message type");
        }
      }
    });

    socket.on("close", () => {
      if (clientId) {
        rooms.disconnect(clientId);
        clientId = null;
      }
    });

    socket.on("error", (err: Error) => {
      app.log.warn({ err }, "socket error");
    });
  });
}

function describeError(code: string): string {
  switch (code) {
    case "invalid-room":
      return "Room does not exist";
    case "room-full":
      return "Room already has two participants";
    default:
      return code;
  }
}
