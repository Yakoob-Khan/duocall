import type {
  ClientMessage,
  ServerMessage,
  SignalPayload,
} from "./types";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

type Handler<T> = (value: T) => void;

type SignalingEvents = {
  message: ServerMessage;
  connectionState: ConnectionState;
};

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 30_000;
const MAX_MISSED_PONGS = 2;
const BACKOFF_START_MS = 500;
const BACKOFF_MAX_MS = 4_000;

export interface SignalingOptions {
  url: string;
  onError?: (err: Error) => void;
}

export class SignalingClient {
  private readonly url: string;
  private ws: WebSocket | null = null;
  private state: ConnectionState = "idle";
  private handlers: {
    message: Set<Handler<ServerMessage>>;
    connectionState: Set<Handler<ConnectionState>>;
  } = {
    message: new Set(),
    connectionState: new Set(),
  };

  private pingTimer: number | null = null;
  private pongDeadline: number | null = null;
  private missedPongs = 0;

  private backoffMs = BACKOFF_START_MS;
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;

  private sessionToken: string | null = null;
  private pendingJoinRoomId: string | null = null;

  constructor(opts: SignalingOptions) {
    this.url = opts.url;
  }

  on<E extends keyof SignalingEvents>(
    event: E,
    handler: Handler<SignalingEvents[E]>,
  ): () => void {
    (this.handlers[event] as Set<Handler<SignalingEvents[E]>>).add(handler);
    return () =>
      (this.handlers[event] as Set<Handler<SignalingEvents[E]>>).delete(
        handler,
      );
  }

  getState(): ConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.state === "connecting" || this.state === "connected") return;
    this.shouldReconnect = true;
    this.openSocket();
  }

  joinRoom(roomId: string): void {
    this.pendingJoinRoomId = roomId;
    this.sessionToken = null;
    if (this.state === "connected") {
      this.rawSend({ type: "join", roomId });
    } else {
      this.connect();
    }
  }

  leave(): void {
    this.shouldReconnect = false;
    if (this.state === "connected") {
      this.rawSend({ type: "leave" });
    }
    this.sessionToken = null;
    this.pendingJoinRoomId = null;
    this.close(1000, "client-leave");
  }

  sendSignal(to: string, payload: SignalPayload): void {
    this.rawSend({ type: "signal", to, payload });
  }

  close(code = 1000, reason = "client-close"): void {
    this.shouldReconnect = false;
    this.clearTimers();
    try {
      this.ws?.close(code, reason);
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setState("closed");
  }

  private openSocket(): void {
    this.setState(this.sessionToken ? "reconnecting" : "connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.backoffMs = BACKOFF_START_MS;
      this.setState("connected");
      this.startHeartbeat();

      if (this.sessionToken) {
        this.rawSend({ type: "resume", token: this.sessionToken });
      } else if (this.pendingJoinRoomId) {
        this.rawSend({ type: "join", roomId: this.pendingJoinRoomId });
      }
    });

    ws.addEventListener("message", (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (msg.type === "pong") {
        this.missedPongs = 0;
        this.pongDeadline = null;
        return;
      }

      if (msg.type === "joined") {
        this.sessionToken = msg.token;
        this.pendingJoinRoomId = msg.roomId;
      }

      if (
        msg.type === "error" &&
        (msg.code === "session-expired" || msg.code === "invalid-room")
      ) {
        this.sessionToken = null;
        this.pendingJoinRoomId = null;
        this.shouldReconnect = false;
      }

      this.emit("message", msg);
    });

    ws.addEventListener("close", () => {
      this.clearTimers();
      this.ws = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      } else {
        this.setState("closed");
      }
    });

    ws.addEventListener("error", () => {
      // let close handle reconnection
    });
  }

  private scheduleReconnect(): void {
    this.setState("reconnecting");
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private startHeartbeat(): void {
    this.missedPongs = 0;
    this.pongDeadline = null;
    this.pingTimer = window.setInterval(() => this.sendPing(), PING_INTERVAL_MS);
    this.sendPing();
  }

  private sendPing(): void {
    if (this.pongDeadline && Date.now() > this.pongDeadline) {
      this.missedPongs += 1;
      if (this.missedPongs >= MAX_MISSED_PONGS) {
        try {
          this.ws?.close(4000, "no-pong");
        } catch {
          /* ignore */
        }
        return;
      }
    }
    this.rawSend({ type: "ping" });
    this.pongDeadline = Date.now() + PONG_TIMEOUT_MS;
  }

  private clearTimers(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.pongDeadline = null;
  }

  private rawSend(msg: ClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit("connectionState", next);
  }

  private emit<E extends keyof SignalingEvents>(
    event: E,
    value: SignalingEvents[E],
  ): void {
    for (const h of this.handlers[event] as Set<Handler<SignalingEvents[E]>>) {
      try {
        h(value);
      } catch (err) {
        console.error("signaling handler threw:", err);
      }
    }
  }
}
