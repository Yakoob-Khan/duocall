import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { CallController, CallState } from "../../src/lib/rtc";
import type { ServerMessage, SignalPayload } from "../../src/lib/types";

/* ---------- Fake signaling (subset of SignalingClient) ---------- */
type MessageHandler = (msg: ServerMessage) => void;
class FakeSignaling {
  private messageHandlers: MessageHandler[] = [];
  sentSignals: Array<{ to: string; payload: SignalPayload }> = [];

  on(event: string, handler: MessageHandler): () => void {
    if (event === "message") {
      this.messageHandlers.push(handler);
      return () => {
        this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
      };
    }
    return () => {};
  }

  sendSignal(to: string, payload: SignalPayload) {
    this.sentSignals.push({ to, payload });
  }

  emit(msg: ServerMessage) {
    for (const h of this.messageHandlers) h(msg);
  }
}

/* ---------- Mock RTCPeerConnection ---------- */
interface FakeSender {
  track: MediaStreamTrack | null;
}
class MockPC {
  static instances: MockPC[] = [];
  static latest(): MockPC {
    const p = MockPC.instances[MockPC.instances.length - 1];
    if (!p) throw new Error("no pc yet");
    return p;
  }
  static reset() {
    MockPC.instances = [];
  }

  signalingState: RTCSignalingState = "stable";
  connectionState: RTCPeerConnectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;

  closed = false;
  addedTracks: MediaStreamTrack[] = [];
  addedCandidates: RTCIceCandidateInit[] = [];
  private senders: FakeSender[] = [];
  private listeners: Record<string, ((event: unknown) => void)[]> = {};

  constructor(_config: RTCConfiguration) {
    MockPC.instances.push(this);
  }

  addTrack(track: MediaStreamTrack): RTCRtpSender {
    this.addedTracks.push(track);
    const sender = { track } as FakeSender;
    this.senders.push(sender);
    return sender as unknown as RTCRtpSender;
  }

  getSenders(): RTCRtpSender[] {
    return this.senders as unknown as RTCRtpSender[];
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "mock-offer-sdp" };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "mock-answer-sdp" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
  }

  async addIceCandidate(c: RTCIceCandidateInit): Promise<void> {
    this.addedCandidates.push(c);
  }

  close(): void {
    this.closed = true;
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(listener);
  }

  _emit(type: string, event: unknown) {
    for (const l of this.listeners[type] ?? []) l(event);
  }
}

/* ---------- MediaStream / MediaStreamTrack shims ---------- */
class MockTrack {
  enabled = true;
  kind = "audio";
  stop = vi.fn();
}
class MockStream {
  private tracks: MockTrack[];
  constructor(tracks: MockTrack[] = [new MockTrack()]) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks as unknown as MediaStreamTrack[];
  }
  getAudioTracks() {
    return this.tracks as unknown as MediaStreamTrack[];
  }
}

/* ---------- Setup / teardown ---------- */
let getUserMediaMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  MockPC.reset();
  vi.stubGlobal("RTCPeerConnection", MockPC as unknown as typeof RTCPeerConnection);
  vi.stubGlobal(
    "MediaStream",
    MockStream as unknown as typeof MediaStream,
  );

  getUserMediaMock = vi.fn().mockResolvedValue(new MockStream());
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: getUserMediaMock },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeController() {
  const signaling = new FakeSignaling();
  const call = new CallController({
    signaling: signaling as unknown as import("../../src/lib/signaling").SignalingClient,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  return { signaling, call };
}

async function flushMicrotasks() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("CallController — acquireMic", () => {
  it("requests audio-only user media and adds tracks to the peer connection", async () => {
    const { call } = makeController();
    await call.acquireMic();
    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: true,
      video: false,
    });
    expect(MockPC.instances).toHaveLength(1);
    expect(MockPC.latest().addedTracks.length).toBeGreaterThan(0);
  });

  it("transitions state to waiting-for-peer when acquired without a peer", async () => {
    const { call } = makeController();
    const states: CallState[] = [];
    call.on("callState", (s) => states.push(s));
    await call.acquireMic();
    expect(states).toContain(CallState.AcquiringMic);
    expect(states[states.length - 1]).toBe(CallState.WaitingForPeer);
  });

  it("emits 'mic-denied' error and rethrows on getUserMedia rejection", async () => {
    const { call } = makeController();
    getUserMediaMock.mockRejectedValue(new Error("Permission denied"));
    const errors: Array<{ code: string; message: string }> = [];
    call.on("error", (e) => errors.push(e));
    await expect(call.acquireMic()).rejects.toThrow("Permission denied");
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "mic-denied" }),
    );
  });
});

describe("CallController — negotiation (impolite side)", () => {
  it("on 'joined' with an existing peer, sends an SDP offer", async () => {
    const { signaling, call } = makeController();
    await call.acquireMic();

    signaling.emit({
      type: "joined",
      roomId: "r",
      self: "me",
      token: "t",
      peers: ["peer-1"],
    });

    await flushMicrotasks();

    const offers = signaling.sentSignals.filter(
      (s) => s.payload.kind === "offer",
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]!.to).toBe("peer-1");
    expect(offers[0]!.payload).toMatchObject({ kind: "offer" });
  });

  it("skips negotiation until we have a sending track", async () => {
    const { signaling, call } = makeController();
    // No acquireMic yet -> no tracks on the pc
    signaling.emit({
      type: "joined",
      roomId: "r",
      self: "me",
      token: "t",
      peers: ["peer-1"],
    });
    await flushMicrotasks();
    const offers = signaling.sentSignals.filter(
      (s) => s.payload.kind === "offer",
    );
    expect(offers).toHaveLength(0);
    call.close();
  });
});

describe("CallController — polite side + incoming signals", () => {
  it("on 'peer-joined', enters negotiating and waits for the offer", async () => {
    const { signaling, call } = makeController();
    await call.acquireMic();
    const states: CallState[] = [];
    call.on("callState", (s) => states.push(s));
    signaling.emit({ type: "peer-joined", peerId: "peer-1" });
    expect(states).toContain(CallState.Negotiating);
    // No offer sent — waiting for the impolite side
    const offers = signaling.sentSignals.filter(
      (s) => s.payload.kind === "offer",
    );
    expect(offers).toHaveLength(0);
  });

  it("responds to an incoming offer with an answer", async () => {
    const { signaling, call } = makeController();
    await call.acquireMic();
    signaling.emit({ type: "peer-joined", peerId: "peer-1" });
    signaling.emit({
      type: "signal",
      from: "peer-1",
      payload: { kind: "offer", sdp: "remote-offer-sdp" },
    });

    await flushMicrotasks();

    const answers = signaling.sentSignals.filter(
      (s) => s.payload.kind === "answer",
    );
    expect(answers).toHaveLength(1);
    expect(answers[0]!.to).toBe("peer-1");
    expect(MockPC.latest().remoteDescription).toMatchObject({
      type: "offer",
      sdp: "remote-offer-sdp",
    });
    call.close();
  });

  it("applies an incoming answer as the remote description", async () => {
    const { signaling, call } = makeController();
    await call.acquireMic();
    signaling.emit({
      type: "joined",
      roomId: "r",
      self: "me",
      token: "t",
      peers: ["peer-1"],
    });
    await flushMicrotasks();
    signaling.emit({
      type: "signal",
      from: "peer-1",
      payload: { kind: "answer", sdp: "remote-answer-sdp" },
    });
    await flushMicrotasks();
    expect(MockPC.latest().remoteDescription).toMatchObject({
      type: "answer",
      sdp: "remote-answer-sdp",
    });
    call.close();
  });

  it("adds ICE candidates arriving after the remote description", async () => {
    const { signaling, call } = makeController();
    await call.acquireMic();
    signaling.emit({
      type: "joined",
      roomId: "r",
      self: "me",
      token: "t",
      peers: ["peer-1"],
    });
    await flushMicrotasks();
    signaling.emit({
      type: "signal",
      from: "peer-1",
      payload: { kind: "answer", sdp: "remote-answer-sdp" },
    });
    await flushMicrotasks();

    signaling.emit({
      type: "signal",
      from: "peer-1",
      payload: {
        kind: "ice",
        candidate: {
          candidate: "candidate:...",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      },
    });
    await flushMicrotasks();

    expect(MockPC.latest().addedCandidates).toHaveLength(1);
    call.close();
  });

  it("queues ICE candidates that arrive before the remote description, then flushes", async () => {
    const { signaling, call } = makeController();
    await call.acquireMic();
    signaling.emit({ type: "peer-joined", peerId: "peer-1" });

    // Send candidate BEFORE offer arrives
    signaling.emit({
      type: "signal",
      from: "peer-1",
      payload: {
        kind: "ice",
        candidate: {
          candidate: "candidate:early",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      },
    });
    await flushMicrotasks();
    // No candidate yet — should be queued
    expect(MockPC.latest().addedCandidates).toHaveLength(0);

    // Offer arrives
    signaling.emit({
      type: "signal",
      from: "peer-1",
      payload: { kind: "offer", sdp: "remote-offer-sdp" },
    });
    await flushMicrotasks();

    // Now the queued candidate should have been flushed
    expect(MockPC.latest().addedCandidates).toHaveLength(1);
    expect(MockPC.latest().addedCandidates[0]!.candidate).toBe(
      "candidate:early",
    );
    call.close();
  });
});

describe("CallController — ICE candidate outgoing", () => {
  it("forwards locally-gathered ICE candidates to the peer via signaling", async () => {
    const { signaling, call } = makeController();
    await call.acquireMic();
    signaling.emit({
      type: "joined",
      roomId: "r",
      self: "me",
      token: "t",
      peers: ["peer-1"],
    });
    await flushMicrotasks();

    const candidate = {
      candidate: "candidate:local",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: null,
    };
    MockPC.latest()._emit("icecandidate", { candidate });

    const iceSignals = signaling.sentSignals.filter(
      (s) => s.payload.kind === "ice",
    );
    expect(iceSignals).toHaveLength(1);
    expect(iceSignals[0]!.to).toBe("peer-1");
    call.close();
  });

  it("skips end-of-candidates events (candidate === null)", async () => {
    const { signaling, call } = makeController();
    await call.acquireMic();
    signaling.emit({
      type: "joined",
      roomId: "r",
      self: "me",
      token: "t",
      peers: ["peer-1"],
    });
    await flushMicrotasks();

    signaling.sentSignals.length = 0;
    MockPC.latest()._emit("icecandidate", { candidate: null });
    const iceSignals = signaling.sentSignals.filter(
      (s) => s.payload.kind === "ice",
    );
    expect(iceSignals).toHaveLength(0);
    call.close();
  });
});

describe("CallController — remote stream and connection state", () => {
  it("emits remoteStream when a track event fires on the pc", async () => {
    const { call } = makeController();
    await call.acquireMic();
    const streams: Array<MediaStream | null> = [];
    call.on("remoteStream", (s) => streams.push(s));

    const fakeStream = new MockStream();
    MockPC.latest()._emit("track", {
      streams: [fakeStream],
      track: new MockTrack(),
    });
    expect(streams).toHaveLength(1);
    expect(streams[0]).toBe(fakeStream);
    call.close();
  });

  it("transitions to 'connected' when pc.connectionState becomes 'connected'", async () => {
    const { call } = makeController();
    await call.acquireMic();
    const states: CallState[] = [];
    call.on("callState", (s) => states.push(s));

    MockPC.latest().connectionState = "connected";
    MockPC.latest()._emit("connectionstatechange", {});
    expect(states).toContain(CallState.Connected);
    call.close();
  });

  it("emits ice-failed error when connectionState becomes 'failed'", async () => {
    const { call } = makeController();
    await call.acquireMic();
    const errors: Array<{ code: string; message: string }> = [];
    call.on("error", (e) => errors.push(e));

    MockPC.latest().connectionState = "failed";
    MockPC.latest()._emit("connectionstatechange", {});
    expect(errors).toContainEqual(
      expect.objectContaining({ code: "ice-failed" }),
    );
    call.close();
  });
});

describe("CallController — mute", () => {
  it("setMuted(true) disables all local audio tracks", async () => {
    const { call } = makeController();
    const track = new MockTrack();
    getUserMediaMock.mockResolvedValue(new MockStream([track]));
    await call.acquireMic();
    call.setMuted(true);
    expect(track.enabled).toBe(false);
    expect(call.isMuted()).toBe(true);
    call.setMuted(false);
    expect(track.enabled).toBe(true);
    expect(call.isMuted()).toBe(false);
  });

  it("setMuted is a no-op when no local stream exists yet", () => {
    const { call } = makeController();
    expect(() => call.setMuted(true)).not.toThrow();
  });
});

describe("CallController — peer-left and close", () => {
  it("on 'peer-left', tears down the peer connection and returns to waiting", async () => {
    const { signaling, call } = makeController();
    await call.acquireMic();
    signaling.emit({
      type: "joined",
      roomId: "r",
      self: "me",
      token: "t",
      peers: ["peer-1"],
    });
    const pcBefore = MockPC.latest();
    const states: CallState[] = [];
    call.on("callState", (s) => states.push(s));
    const streams: Array<MediaStream | null> = [];
    call.on("remoteStream", (s) => streams.push(s));

    signaling.emit({ type: "peer-left", peerId: "peer-1" });

    expect(pcBefore.closed).toBe(true);
    expect(states).toContain(CallState.WaitingForPeer);
    expect(streams).toContain(null);
  });

  it("close() closes the pc and stops local tracks", async () => {
    const { call } = makeController();
    const track = new MockTrack();
    getUserMediaMock.mockResolvedValue(new MockStream([track]));
    await call.acquireMic();
    const pc = MockPC.latest();
    call.close();
    expect(pc.closed).toBe(true);
    expect(track.stop).toHaveBeenCalled();
  });

  it("close() emits state 'closed'", async () => {
    const { call } = makeController();
    await call.acquireMic();
    const states: CallState[] = [];
    call.on("callState", (s) => states.push(s));
    call.close();
    expect(states[states.length - 1]).toBe(CallState.Closed);
  });
});

describe("CallController — server error passthrough", () => {
  it("re-emits server error messages via 'error' event", () => {
    const { signaling, call } = makeController();
    const errors: Array<{ code: string; message: string }> = [];
    call.on("error", (e) => errors.push(e));
    signaling.emit({
      type: "error",
      code: "room-full",
      message: "Two peers already",
    });
    expect(errors).toContainEqual({
      code: "room-full",
      message: "Two peers already",
    });
    call.close();
  });
});
