import { nanoid } from "nanoid";
import { config } from "./config.js";
import type { ServerMessage, SignalPayload } from "./types.js";

export interface Client {
  id: string;
  roomId: string;
  token: string;
  send: (msg: ServerMessage) => void;
  connected: boolean;
  lastSeenAt: number;
  disconnectTimer: NodeJS.Timeout | null;
}

interface Room {
  id: string;
  clients: Map<string, Client>;
  ttlTimer: NodeJS.Timeout | null;
}

export type JoinResult =
  | { ok: true; client: Client; peers: Client[] }
  | { ok: false; error: "invalid-room" | "room-full" };

export type ResumeResult =
  | { ok: true; client: Client; peers: Client[] }
  | { ok: false; error: "session-expired" };

export class RoomManager {
  private rooms = new Map<string, Room>();
  private clients = new Map<string, Client>();
  private sessions = new Map<string, string>();

  createRoom(): string {
    const id = nanoid(config.roomIdLength);
    const room: Room = {
      id,
      clients: new Map(),
      ttlTimer: setTimeout(() => this.destroyIfEmpty(id), config.emptyRoomTtlMs),
    };
    this.rooms.set(id, room);
    return id;
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  join(
    roomId: string,
    send: (msg: ServerMessage) => void,
  ): JoinResult {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: "invalid-room" };
    if (room.clients.size >= config.roomCapacity) {
      return { ok: false, error: "room-full" };
    }

    if (room.ttlTimer) {
      clearTimeout(room.ttlTimer);
      room.ttlTimer = null;
    }

    const client: Client = {
      id: nanoid(config.clientIdLength),
      roomId,
      token: nanoid(config.sessionTokenLength),
      send,
      connected: true,
      lastSeenAt: Date.now(),
      disconnectTimer: null,
    };

    const peers = Array.from(room.clients.values());
    room.clients.set(client.id, client);
    this.clients.set(client.id, client);
    this.sessions.set(client.token, client.id);

    return { ok: true, client, peers };
  }

  resume(
    token: string,
    send: (msg: ServerMessage) => void,
  ): ResumeResult {
    const clientId = this.sessions.get(token);
    if (!clientId) return { ok: false, error: "session-expired" };

    const client = this.clients.get(clientId);
    if (!client) return { ok: false, error: "session-expired" };

    const room = this.rooms.get(client.roomId);
    if (!room) return { ok: false, error: "session-expired" };

    if (client.disconnectTimer) {
      clearTimeout(client.disconnectTimer);
      client.disconnectTimer = null;
    }
    client.send = send;
    client.connected = true;
    client.lastSeenAt = Date.now();

    const peers = Array.from(room.clients.values()).filter(
      (c) => c.id !== client.id,
    );
    return { ok: true, client, peers };
  }

  disconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.connected = false;
    if (client.disconnectTimer) clearTimeout(client.disconnectTimer);
    client.disconnectTimer = setTimeout(
      () => this.evict(clientId),
      config.gracePeriodMs,
    );
  }

  leave(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (client.disconnectTimer) {
      clearTimeout(client.disconnectTimer);
      client.disconnectTimer = null;
    }
    this.evict(clientId);
  }

  private evict(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const room = this.rooms.get(client.roomId);
    const remaining: Client[] = [];
    if (room) {
      room.clients.delete(clientId);
      for (const c of room.clients.values()) remaining.push(c);
      if (room.clients.size === 0) {
        room.ttlTimer = setTimeout(
          () => this.destroyIfEmpty(room.id),
          config.emptyRoomTtlMs,
        );
      }
    }

    this.sessions.delete(client.token);
    this.clients.delete(clientId);

    for (const peer of remaining) {
      if (peer.connected) {
        peer.send({ type: "peer-left", peerId: clientId });
      }
    }
  }

  private destroyIfEmpty(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.clients.size > 0) return;
    if (room.ttlTimer) clearTimeout(room.ttlTimer);
    this.rooms.delete(roomId);
  }

  routeSignal(
    fromId: string,
    toId: string,
    payload: SignalPayload,
  ): "ok" | "peer-not-found" {
    const from = this.clients.get(fromId);
    const to = this.clients.get(toId);
    if (!from || !to || from.roomId !== to.roomId) {
      return "peer-not-found";
    }
    if (to.connected) {
      to.send({ type: "signal", from: fromId, payload });
    }
    return "ok";
  }

  touch(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) client.lastSeenAt = Date.now();
  }

  getClient(clientId: string): Client | undefined {
    return this.clients.get(clientId);
  }

  sweepStaleClients(): void {
    const now = Date.now();
    for (const client of this.clients.values()) {
      if (!client.connected) continue;
      if (now - client.lastSeenAt > config.heartbeatTimeoutMs) {
        this.disconnect(client.id);
      }
    }
  }
}
