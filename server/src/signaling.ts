import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { RoomManager, type Client } from "./rooms.js";
import { ROOM_ID_REGEX } from "./config.js";
import type {
  ClientMessage,
  ErrorCode,
  ServerMessage,
} from "./types.js";

type MessageOf<T extends ClientMessage["type"]> = Extract<
  ClientMessage,
  { type: T }
>;

export function registerSignaling(app: FastifyInstance, rooms: RoomManager) {
  app.get("/ws", { websocket: true }, (socket: WebSocket) => {
    let clientId: string | null = null;

    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    };
    const sendError = (code: ErrorCode, message: string) =>
      send({ type: "error", code, message });

    /* ---------- per-message-type handlers ---------- */

    const handleJoin = (msg: MessageOf<"join">) => {
      if (clientId) {
        return sendError("already-joined", "This connection is already in a room");
      }
      if (!ROOM_ID_REGEX.test(msg.roomId)) {
        return sendError("invalid-room", "Room ID is malformed");
      }
      const result = rooms.join(msg.roomId, send);
      if (!result.ok) {
        return sendError(result.error, describeError(result.error));
      }
      clientId = result.client.id;
      send({
        type: "joined",
        roomId: msg.roomId,
        self: result.client.id,
        token: result.client.token,
        peers: result.peers.map((p) => p.id),
      });
      notifyPeersJoined(result.peers, result.client.id);
    };

    const handleResume = (msg: MessageOf<"resume">) => {
      if (clientId) {
        return sendError("already-joined", "This connection is already in a room");
      }
      const result = rooms.resume(msg.token, send);
      if (!result.ok) {
        return sendError(result.error, "Session expired or invalid");
      }
      clientId = result.client.id;
      send({
        type: "resumed",
        roomId: result.client.roomId,
        self: result.client.id,
        peers: result.peers.map((p) => p.id),
      });
    };

    const handleSignal = (msg: MessageOf<"signal">) => {
      if (!clientId) {
        return sendError("not-in-room", "Join a room before signaling");
      }
      const result = rooms.routeSignal(clientId, msg.to, msg.payload);
      if (result === "peer-not-found") {
        sendError("peer-not-found", "Peer not in this room");
      }
    };

    const handleLeave = () => {
      if (!clientId) return;
      rooms.leave(clientId);
      clientId = null;
    };

    const handlePing = () => {
      if (clientId) rooms.touch(clientId);
      send({ type: "pong" });
    };

    /* ---------- socket lifecycle ---------- */

    socket.on("message", (raw: Buffer) => {
      const msg = tryParse(raw);
      if (!msg) return sendError("invalid-message", "Malformed JSON");

      switch (msg.type) {
        case "join":
          return handleJoin(msg);
        case "resume":
          return handleResume(msg);
        case "signal":
          return handleSignal(msg);
        case "leave":
          return handleLeave();
        case "ping":
          return handlePing();
        default:
          return sendError("invalid-message", "Unknown message type");
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

/* ---------- pure helpers ---------- */

function tryParse(raw: Buffer): ClientMessage | null {
  try {
    return JSON.parse(raw.toString()) as ClientMessage;
  } catch {
    return null;
  }
}

function notifyPeersJoined(peers: Client[], newPeerId: string): void {
  for (const peer of peers) {
    if (peer.connected) {
      peer.send({ type: "peer-joined", peerId: newPeerId });
    }
  }
}

function describeError(code: ErrorCode): string {
  switch (code) {
    case "invalid-room":
      return "Room does not exist";
    case "room-full":
      return "Room already has two participants";
    default:
      return code;
  }
}
