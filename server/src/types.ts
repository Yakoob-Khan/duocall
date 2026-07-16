export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInitLike };

export interface RTCIceCandidateInitLike {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

export type ClientMessage =
  | { type: "join"; roomId: string }
  | { type: "resume"; token: string }
  | { type: "leave" }
  | { type: "signal"; to: string; payload: SignalPayload }
  | { type: "ping" };

export type ErrorCode =
  | "invalid-message"
  | "invalid-room"
  | "room-full"
  | "session-expired"
  | "not-in-room"
  | "peer-not-found"
  | "already-joined"
  | "rate-limited";

export type ServerMessage =
  | {
      type: "joined";
      roomId: string;
      self: string;
      token: string;
      peers: string[];
    }
  | { type: "resumed"; roomId: string; self: string; peers: string[] }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; payload: SignalPayload }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "pong" };
