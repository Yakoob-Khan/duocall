import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { SignalingClient, ConnectionState } from "../../src/lib/signaling";
import type { ServerMessage } from "../../src/lib/types";

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  OPEN = 1;
  CLOSED = 3;

  static instances: MockWebSocket[] = [];
  static latest(): MockWebSocket {
    const inst = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    if (!inst) throw new Error("no MockWebSocket instance yet");
    return inst;
  }
  static reset() {
    MockWebSocket.instances = [];
  }

  url: string;
  readyState = 0;
  sent: string[] = [];
  private listeners: Record<string, ((event: unknown) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(listener);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this._trigger("close", { code: 1000 });
  }

  _open() {
    this.readyState = 1;
    this._trigger("open", {});
  }

  _recv(msg: ServerMessage) {
    this._trigger("message", { data: JSON.stringify(msg) });
  }

  _remoteClose() {
    this.readyState = 3;
    this._trigger("close", { code: 1006 });
  }

  _trigger(type: string, payload: unknown) {
    for (const l of this.listeners[type] ?? []) l(payload);
  }

  parsedSent(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

beforeEach(() => {
  MockWebSocket.reset();
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SignalingClient — connect + join", () => {
  it("opens a WebSocket to the configured URL when joinRoom is called", () => {
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.joinRoom("room-abc");
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.latest().url).toBe("ws://test/ws");
    client.close();
  });

  it("transitions connectionState: connecting → connected", () => {
    const client = new SignalingClient({ url: "ws://test/ws" });
    const states: ConnectionState[] = [];
    client.on("connectionState", (s) => states.push(s));
    client.joinRoom("room-abc");
    expect(states).toContain(ConnectionState.Connecting);
    MockWebSocket.latest()._open();
    expect(states).toContain(ConnectionState.Connected);
    client.close();
  });

  it("sends a join message on the socket after it opens", () => {
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();
    expect(MockWebSocket.latest().parsedSent()).toContainEqual({
      type: "join",
      roomId: "room-abc",
    });
    client.close();
  });
});

describe("SignalingClient — message routing", () => {
  it("relays server messages via the 'message' event", () => {
    const client = new SignalingClient({ url: "ws://test/ws" });
    const received: ServerMessage[] = [];
    client.on("message", (m) => received.push(m));
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();
    MockWebSocket.latest()._recv({
      type: "joined",
      roomId: "room-abc",
      self: "me",
      token: "t-1",
      peers: [],
    });
    expect(received).toContainEqual({
      type: "joined",
      roomId: "room-abc",
      self: "me",
      token: "t-1",
      peers: [],
    });
    client.close();
  });

  it("swallows pong messages (internal-only, not surfaced to consumers)", () => {
    const client = new SignalingClient({ url: "ws://test/ws" });
    const received: ServerMessage[] = [];
    client.on("message", (m) => received.push(m));
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();
    MockWebSocket.latest()._recv({ type: "pong" });
    expect(received.find((m) => m.type === "pong")).toBeUndefined();
    client.close();
  });

  it("sendSignal emits a signal frame to the peer when connected", () => {
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();
    MockWebSocket.latest().sent = [];
    client.sendSignal("peer-1", { kind: "offer", sdp: "test-sdp" });
    expect(MockWebSocket.latest().parsedSent()).toContainEqual({
      type: "signal",
      to: "peer-1",
      payload: { kind: "offer", sdp: "test-sdp" },
    });
    client.close();
  });

  it("sendSignal is a no-op when the socket isn't open", () => {
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.sendSignal("peer-1", { kind: "offer", sdp: "x" });
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});

describe("SignalingClient — heartbeat", () => {
  it("sends a ping immediately on open and then every 25s", () => {
    vi.useFakeTimers();
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();

    const pingsAfterOpen = MockWebSocket.latest()
      .parsedSent()
      .filter((m: unknown) => (m as { type: string }).type === "ping").length;
    expect(pingsAfterOpen).toBe(1);

    vi.advanceTimersByTime(25_000);
    const pingsAfter25s = MockWebSocket.latest()
      .parsedSent()
      .filter((m: unknown) => (m as { type: string }).type === "ping").length;
    expect(pingsAfter25s).toBe(2);

    vi.advanceTimersByTime(25_000);
    const pingsAfter50s = MockWebSocket.latest()
      .parsedSent()
      .filter((m: unknown) => (m as { type: string }).type === "ping").length;
    expect(pingsAfter50s).toBe(3);

    client.close();
  });
});

describe("SignalingClient — reconnect + resume", () => {
  it("stores the session token from a 'joined' message", () => {
    vi.useFakeTimers();
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.joinRoom("room-abc");
    const first = MockWebSocket.latest();
    first._open();
    first._recv({
      type: "joined",
      roomId: "room-abc",
      self: "me",
      token: "session-token-abc",
      peers: [],
    });

    first._remoteClose();
    vi.advanceTimersByTime(600);
    expect(MockWebSocket.instances).toHaveLength(2);
    const second = MockWebSocket.latest();
    second._open();

    expect(second.parsedSent()).toContainEqual({
      type: "resume",
      token: "session-token-abc",
    });

    client.close();
  });

  it("uses exponential backoff between reconnect attempts", () => {
    vi.useFakeTimers();
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.joinRoom("room-abc");
    const first = MockWebSocket.latest();
    first._open();
    first._recv({
      type: "joined",
      roomId: "room-abc",
      self: "me",
      token: "t",
      peers: [],
    });
    first._remoteClose();

    // Before backoff completes, no new socket
    vi.advanceTimersByTime(499);
    expect(MockWebSocket.instances).toHaveLength(1);

    // At 500ms, second socket exists
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second attempt fails immediately
    MockWebSocket.latest()._remoteClose();

    // Second reconnect uses ~1000ms backoff
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    client.close();
  });

  it("emits 'reconnecting' state during backoff", () => {
    vi.useFakeTimers();
    const client = new SignalingClient({ url: "ws://test/ws" });
    const states: ConnectionState[] = [];
    client.on("connectionState", (s) => states.push(s));
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();
    MockWebSocket.latest()._recv({
      type: "joined",
      roomId: "room-abc",
      self: "me",
      token: "t",
      peers: [],
    });
    MockWebSocket.latest()._remoteClose();
    expect(states).toContain(ConnectionState.Reconnecting);
    client.close();
  });

  it("does not reconnect after leave()", () => {
    vi.useFakeTimers();
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();
    client.leave();
    vi.advanceTimersByTime(30_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("stops reconnecting after invalid-room error", () => {
    vi.useFakeTimers();
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();
    MockWebSocket.latest()._recv({
      type: "error",
      code: "invalid-room",
      message: "no such room",
    });
    MockWebSocket.latest()._remoteClose();
    vi.advanceTimersByTime(10_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("stops reconnecting after session-expired error", () => {
    vi.useFakeTimers();
    const client = new SignalingClient({ url: "ws://test/ws" });
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();
    MockWebSocket.latest()._recv({
      type: "error",
      code: "session-expired",
      message: "expired",
    });
    MockWebSocket.latest()._remoteClose();
    vi.advanceTimersByTime(10_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});

describe("SignalingClient — close", () => {
  it("transitions state to closed and does not reconnect", () => {
    vi.useFakeTimers();
    const client = new SignalingClient({ url: "ws://test/ws" });
    const states: ConnectionState[] = [];
    client.on("connectionState", (s) => states.push(s));
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();
    client.close();
    expect(states[states.length - 1]).toBe(ConnectionState.Closed);
    vi.advanceTimersByTime(30_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("on() returns an unsubscribe function", () => {
    const client = new SignalingClient({ url: "ws://test/ws" });
    const received: ServerMessage[] = [];
    const off = client.on("message", (m) => received.push(m));
    client.joinRoom("room-abc");
    MockWebSocket.latest()._open();

    off();
    MockWebSocket.latest()._recv({
      type: "joined",
      roomId: "r",
      self: "me",
      token: "t",
      peers: [],
    });
    expect(received).toHaveLength(0);
    client.close();
  });
});
