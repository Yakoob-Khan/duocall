import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RoomManager } from "../src/rooms.js";
import { config } from "../src/config.js";
import type { ServerMessage } from "../src/types.js";

function makeSendSpy() {
  const sent: ServerMessage[] = [];
  const send = (msg: ServerMessage) => {
    sent.push(msg);
  };
  return { sent, send };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ---------- createRoom + hasRoom ---------- */

describe("RoomManager - createRoom", () => {
  it("creates a room with an id of the configured length", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    expect(id).toHaveLength(config.roomIdLength);
    expect(rooms.hasRoom(id)).toBe(true);
  });

  it("returns unique ids for successive rooms", () => {
    const rooms = new RoomManager();
    const ids = new Set(Array.from({ length: 20 }, () => rooms.createRoom()));
    expect(ids.size).toBe(20);
  });

  it("destroys an unused room after the empty-room TTL expires", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    expect(rooms.hasRoom(id)).toBe(true);
    vi.advanceTimersByTime(config.emptyRoomTtlMs + 1);
    expect(rooms.hasRoom(id)).toBe(false);
  });
});

/* ---------- join ---------- */

describe("RoomManager - join", () => {
  it("returns invalid-room for a non-existent room", () => {
    const rooms = new RoomManager();
    const { send } = makeSendSpy();
    const result = rooms.join("does-not-exist", send);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid-room");
  });

  it("adds a client with a unique id + session token on successful join", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const { send } = makeSendSpy();
    const result = rooms.join(id, send);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.client.id).toHaveLength(config.clientIdLength);
    expect(result.client.token).toHaveLength(config.sessionTokenLength);
    expect(result.client.roomId).toBe(id);
    expect(result.peers).toEqual([]);
  });

  it("returns the existing peer in the peers list on the second join", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    const b = rooms.join(id, makeSendSpy().send);
    if (!a.ok || !b.ok) throw new Error("join failed");
    expect(b.peers.map((p) => p.id)).toEqual([a.client.id]);
    expect(a.peers).toEqual([]);
  });

  it("rejects a third join with room-full", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    rooms.join(id, makeSendSpy().send);
    rooms.join(id, makeSendSpy().send);
    const result = rooms.join(id, makeSendSpy().send);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("room-full");
  });

  it("cancels the empty-room TTL timer when the first client joins", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    rooms.join(id, makeSendSpy().send);
    // Advance well past the TTL - room should still exist because it has a client
    vi.advanceTimersByTime(config.emptyRoomTtlMs * 2);
    expect(rooms.hasRoom(id)).toBe(true);
  });
});

/* ---------- resume ---------- */

describe("RoomManager - resume", () => {
  it("returns session-expired for an unknown token", () => {
    const rooms = new RoomManager();
    const result = rooms.resume("nonsense-token", makeSendSpy().send);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("session-expired");
  });

  it("reattaches the same clientId when the token is valid", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const first = rooms.join(id, makeSendSpy().send);
    if (!first.ok) throw new Error();

    const originalId = first.client.id;
    const originalToken = first.client.token;

    const spy2 = makeSendSpy();
    const resumed = rooms.resume(originalToken, spy2.send);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.client.id).toBe(originalId);
  });

  it("resume replaces the send function so future messages go to the new socket", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const spyA = makeSendSpy();
    const a = rooms.join(id, spyA.send);
    const spyB = makeSendSpy();
    const b = rooms.join(id, spyB.send);
    if (!a.ok || !b.ok) throw new Error();

    // A drops and resumes with a new send function
    rooms.disconnect(a.client.id);
    const spyAResumed = makeSendSpy();
    rooms.resume(a.client.token, spyAResumed.send);

    // A signal from B to A should reach the new send fn, not the old one
    rooms.routeSignal(b.client.id, a.client.id, {
      kind: "offer",
      sdp: "post-resume",
    });
    expect(spyAResumed.sent).toContainEqual(
      expect.objectContaining({ type: "signal", from: b.client.id }),
    );
    expect(spyA.sent.find((m) => m.type === "signal")).toBeUndefined();
  });

  it("cancels the grace-period eviction timer on successful resume", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    const bSpy = makeSendSpy();
    rooms.join(id, bSpy.send);
    if (!a.ok) throw new Error();

    // A disconnects
    rooms.disconnect(a.client.id);
    // Resume within grace period
    vi.advanceTimersByTime(config.gracePeriodMs - 100);
    const resumed = rooms.resume(a.client.token, makeSendSpy().send);
    expect(resumed.ok).toBe(true);

    // Advance past when the grace period would have fired
    vi.advanceTimersByTime(1_000);

    // The other peer should NOT have received peer-left because grace was cancelled
    const peerLeft = bSpy.sent.find((m) => m.type === "peer-left");
    expect(peerLeft).toBeUndefined();
  });
});

/* ---------- disconnect + grace period ---------- */

describe("RoomManager - disconnect + grace period", () => {
  it("does not immediately evict the client on disconnect", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    const bSpy = makeSendSpy();
    rooms.join(id, bSpy.send);
    if (!a.ok) throw new Error();

    rooms.disconnect(a.client.id);
    // No peer-left yet
    expect(bSpy.sent.find((m) => m.type === "peer-left")).toBeUndefined();
  });

  it("evicts the client after the grace period and notifies remaining peers", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    const bSpy = makeSendSpy();
    rooms.join(id, bSpy.send);
    if (!a.ok) throw new Error();

    rooms.disconnect(a.client.id);
    vi.advanceTimersByTime(config.gracePeriodMs + 100);

    const peerLeft = bSpy.sent.find((m) => m.type === "peer-left");
    expect(peerLeft).toEqual({ type: "peer-left", peerId: a.client.id });
  });

  it("evicting the last client starts the empty-room TTL", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    if (!a.ok) throw new Error();

    rooms.leave(a.client.id);
    // Room still exists, waiting on TTL
    expect(rooms.hasRoom(id)).toBe(true);
    vi.advanceTimersByTime(config.emptyRoomTtlMs + 1);
    expect(rooms.hasRoom(id)).toBe(false);
  });
});

/* ---------- leave ---------- */

describe("RoomManager - leave", () => {
  it("immediately evicts and notifies remaining peers", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    const bSpy = makeSendSpy();
    rooms.join(id, bSpy.send);
    if (!a.ok) throw new Error();

    rooms.leave(a.client.id);
    expect(bSpy.sent).toContainEqual({
      type: "peer-left",
      peerId: a.client.id,
    });
  });

  it("invalidates the session token so a later resume fails", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    if (!a.ok) throw new Error();
    const token = a.client.token;

    rooms.leave(a.client.id);
    const result = rooms.resume(token, makeSendSpy().send);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("session-expired");
  });
});

/* ---------- routeSignal ---------- */

describe("RoomManager - routeSignal", () => {
  it("delivers the signal to a peer in the same room", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const spyA = makeSendSpy();
    const spyB = makeSendSpy();
    const a = rooms.join(id, spyA.send);
    const b = rooms.join(id, spyB.send);
    if (!a.ok || !b.ok) throw new Error();

    const result = rooms.routeSignal(a.client.id, b.client.id, {
      kind: "offer",
      sdp: "test-sdp",
    });
    expect(result).toBe("ok");
    expect(spyB.sent).toContainEqual({
      type: "signal",
      from: a.client.id,
      payload: { kind: "offer", sdp: "test-sdp" },
    });
  });

  it("returns peer-not-found when the target isn't in the same room", () => {
    const rooms = new RoomManager();
    const room1 = rooms.createRoom();
    const room2 = rooms.createRoom();
    const a = rooms.join(room1, makeSendSpy().send);
    const c = rooms.join(room2, makeSendSpy().send);
    if (!a.ok || !c.ok) throw new Error();

    const result = rooms.routeSignal(a.client.id, c.client.id, {
      kind: "offer",
      sdp: "x",
    });
    expect(result).toBe("peer-not-found");
  });

  it("returns peer-not-found for an unknown peer id", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    if (!a.ok) throw new Error();
    const result = rooms.routeSignal(a.client.id, "not-a-real-client", {
      kind: "offer",
      sdp: "x",
    });
    expect(result).toBe("peer-not-found");
  });

  it("returns ok but does not send when the target is in the grace period", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const spyA = makeSendSpy();
    const spyB = makeSendSpy();
    const a = rooms.join(id, spyA.send);
    const b = rooms.join(id, spyB.send);
    if (!a.ok || !b.ok) throw new Error();

    rooms.disconnect(b.client.id);
    const before = spyB.sent.length;
    const result = rooms.routeSignal(a.client.id, b.client.id, {
      kind: "offer",
      sdp: "x",
    });
    expect(result).toBe("ok");
    expect(spyB.sent.length).toBe(before);
  });
});

/* ---------- touch + sweepStaleClients ---------- */

describe("RoomManager - heartbeat sweep", () => {
  it("evicts a stale connected client via disconnect grace flow", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    const bSpy = makeSendSpy();
    const b = rooms.join(id, bSpy.send);
    if (!a.ok || !b.ok) throw new Error();

    // Advance in halves, touching B each time so only A goes stale
    const halfway = config.heartbeatTimeoutMs / 2 + 1;
    vi.advanceTimersByTime(halfway);
    rooms.touch(b.client.id);
    vi.advanceTimersByTime(halfway);
    rooms.sweepStaleClients();

    // A is now in grace period; advance past it so it evicts
    vi.advanceTimersByTime(config.gracePeriodMs + 1);

    expect(bSpy.sent).toContainEqual({
      type: "peer-left",
      peerId: a.client.id,
    });
  });

  it("touch() keeps a client fresh so sweep does not evict them", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    if (!a.ok) throw new Error();

    // Advance in chunks smaller than the timeout, touching each time
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(config.heartbeatTimeoutMs / 2);
      rooms.touch(a.client.id);
      rooms.sweepStaleClients();
    }
    expect(rooms.getClient(a.client.id)?.connected).toBe(true);
  });
});

/* ---------- getClient ---------- */

describe("RoomManager - getClient", () => {
  it("returns the client for a known id", () => {
    const rooms = new RoomManager();
    const id = rooms.createRoom();
    const a = rooms.join(id, makeSendSpy().send);
    if (!a.ok) throw new Error();
    expect(rooms.getClient(a.client.id)?.id).toBe(a.client.id);
  });

  it("returns undefined for an unknown id", () => {
    const rooms = new RoomManager();
    expect(rooms.getClient("nope")).toBeUndefined();
  });
});
