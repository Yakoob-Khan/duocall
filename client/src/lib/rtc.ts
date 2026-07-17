import type { SignalingClient } from "./signaling";
import type { SignalPayload } from "./types";

export const CallState = {
  Idle: "idle",
  AcquiringMic: "acquiring-mic",
  WaitingForPeer: "waiting-for-peer",
  Negotiating: "negotiating",
  Connected: "connected",
  Reconnecting: "reconnecting",
  Failed: "failed",
  Closed: "closed",
} as const;

export type CallState = (typeof CallState)[keyof typeof CallState];

type Handler<T> = (value: T) => void;

export interface CaptionEvent {
  text: string;
  final: boolean;
}

type CallEvents = {
  callState: CallState;
  remoteStream: MediaStream | null;
  error: { code: string; message: string };
  caption: CaptionEvent;
};

export interface CallControllerOptions {
  signaling: SignalingClient;
  iceServers: RTCIceServer[];
}

export class CallController {
  private readonly signaling: SignalingClient;
  private readonly iceServers: RTCIceServer[];

  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private peerId: string | null = null;
  private makingOffer = false;
  private ignoreOffer = false;
  private isPolite = false;
  private queuedRemoteCandidates: RTCIceCandidateInit[] = [];
  private captionsChannel: RTCDataChannel | null = null;

  private handlers: {
    callState: Set<Handler<CallState>>;
    remoteStream: Set<Handler<MediaStream | null>>;
    error: Set<Handler<{ code: string; message: string }>>;
    caption: Set<Handler<CaptionEvent>>;
  } = {
    callState: new Set(),
    remoteStream: new Set(),
    error: new Set(),
    caption: new Set(),
  };

  private state: CallState = "idle";
  private unsubscribes: (() => void)[] = [];

  constructor(opts: CallControllerOptions) {
    this.signaling = opts.signaling;
    this.iceServers = opts.iceServers;

    this.unsubscribes.push(
      this.signaling.on("message", (msg) => {
        switch (msg.type) {
          case "joined":
            if (msg.peers[0]) {
              this.peerId = msg.peers[0];
              this.isPolite = false;
              void this.startNegotiation();
            } else {
              this.setState("waiting-for-peer");
            }
            break;
          case "resumed":
            if (msg.peers[0]) {
              this.peerId = msg.peers[0];
            }
            break;
          case "peer-joined":
            // Existing member: we're polite, wait for the offer.
            this.peerId = msg.peerId;
            this.isPolite = true;
            this.setState("negotiating");
            break;
          case "peer-left":
            this.handlePeerLeft();
            break;
          case "signal":
            void this.handleSignal(msg.from, msg.payload);
            break;
          case "error":
            this.emit("error", { code: msg.code, message: msg.message });
            break;
        }
      }),
    );
  }

  on<E extends keyof CallEvents>(
    event: E,
    handler: Handler<CallEvents[E]>,
  ): () => void {
    (this.handlers[event] as Set<Handler<CallEvents[E]>>).add(handler);
    return () =>
      (this.handlers[event] as Set<Handler<CallEvents[E]>>).delete(handler);
  }

  getState(): CallState {
    return this.state;
  }

  async acquireMic(): Promise<MediaStream> {
    this.setState("acquiring-mic");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      this.localStream = stream;
      this.ensurePeerConnection();
      for (const track of stream.getTracks()) {
        this.pc?.addTrack(track, stream);
      }
      this.setState(this.peerId ? "negotiating" : "waiting-for-peer");
      return stream;
    } catch (err) {
      this.setState("failed");
      const message = err instanceof Error ? err.message : "unknown-error";
      this.emit("error", { code: "mic-denied", message });
      throw err;
    }
  }

  setMuted(muted: boolean): void {
    if (!this.localStream) return;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  isMuted(): boolean {
    if (!this.localStream) return false;
    const track = this.localStream.getAudioTracks()[0];
    return track ? !track.enabled : false;
  }

  close(): void {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
    this.teardownPeer();
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
    this.setState("closed");
  }

  private ensurePeerConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    pc.addEventListener("icecandidate", (event) => {
      if (!event.candidate || !this.peerId) return;
      this.signaling.sendSignal(this.peerId, {
        kind: "ice",
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment,
        },
      });
    });

    pc.addEventListener("track", (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.emit("remoteStream", stream);
    });

    pc.addEventListener("connectionstatechange", () => {
      const cs = pc.connectionState;
      if (cs === "connected") this.setState("connected");
      else if (cs === "failed") {
        this.setState("failed");
        this.emit("error", {
          code: "ice-failed",
          message:
            "Couldn't establish a peer-to-peer connection. This can happen on restrictive networks.",
        });
      } else if (cs === "disconnected") this.setState("reconnecting");
    });

    pc.addEventListener("negotiationneeded", () => {
      void this.startNegotiation();
    });

    // Polite side: peer creates the data channel; we adopt it when it arrives.
    pc.addEventListener("datachannel", (event) => {
      this.attachCaptionsChannel(event.channel);
    });

    this.pc = pc;
    return pc;
  }

  private attachCaptionsChannel(channel: RTCDataChannel): void {
    this.captionsChannel = channel;
    channel.addEventListener("message", (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          text?: string;
          final?: boolean;
        };
        if (
          parsed.type === "caption" &&
          typeof parsed.text === "string" &&
          typeof parsed.final === "boolean"
        ) {
          this.emit("caption", { text: parsed.text, final: parsed.final });
        }
      } catch {
        /* ignore malformed */
      }
    });
  }

  sendCaption(text: string, final: boolean): void {
    if (this.captionsChannel?.readyState !== "open") return;
    this.captionsChannel.send(
      JSON.stringify({ type: "caption", text, final }),
    );
  }

  private async startNegotiation(): Promise<void> {
    if (!this.peerId) return;
    if (!this.pc) this.ensurePeerConnection();
    const pc = this.pc!;
    // Avoid sending an offer with no media - negotiationneeded (fired by
    // addTrack) or the joined handler will retry once we have a sending track.
    const hasSendingTrack = pc.getSenders().some((s) => !!s.track);
    if (!hasSendingTrack) return;
    // Impolite side: create the captions data channel before the offer so it's
    // part of the SDP. The polite side will receive it via 'datachannel'.
    if (!this.isPolite && !this.captionsChannel) {
      this.attachCaptionsChannel(pc.createDataChannel("captions"));
    }
    try {
      this.makingOffer = true;
      this.setState("negotiating");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signaling.sendSignal(this.peerId, {
        kind: "offer",
        sdp: pc.localDescription?.sdp ?? offer.sdp ?? "",
      });
    } catch (err) {
      this.emit("error", {
        code: "negotiation-failed",
        message: err instanceof Error ? err.message : "negotiation failed",
      });
    } finally {
      this.makingOffer = false;
    }
  }

  private async handleSignal(from: string, payload: SignalPayload): Promise<void> {
    if (!this.peerId) this.peerId = from;
    if (this.peerId !== from) return;
    if (!this.pc) this.ensurePeerConnection();
    const pc = this.pc!;

    try {
      if (payload.kind === "offer") {
        const offerCollision =
          this.makingOffer || pc.signalingState !== "stable";
        this.ignoreOffer = !this.isPolite && offerCollision;
        if (this.ignoreOffer) return;

        await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
        await this.flushQueuedCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signaling.sendSignal(from, {
          kind: "answer",
          sdp: pc.localDescription?.sdp ?? answer.sdp ?? "",
        });
      } else if (payload.kind === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
        await this.flushQueuedCandidates();
      } else if (payload.kind === "ice") {
        if (!pc.remoteDescription) {
          this.queuedRemoteCandidates.push(payload.candidate);
        } else {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch (err) {
            if (!this.ignoreOffer) throw err;
          }
        }
      }
    } catch (err) {
      this.emit("error", {
        code: "signal-failed",
        message: err instanceof Error ? err.message : "signal handling failed",
      });
    }
  }

  private async flushQueuedCandidates(): Promise<void> {
    if (!this.pc) return;
    const queued = this.queuedRemoteCandidates.splice(0);
    for (const c of queued) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {
        /* ignore */
      }
    }
  }

  private handlePeerLeft(): void {
    this.teardownPeer();
    this.emit("remoteStream", null);
    this.setState("waiting-for-peer");
  }

  private teardownPeer(): void {
    if (this.captionsChannel) {
      try {
        this.captionsChannel.close();
      } catch {
        /* ignore */
      }
      this.captionsChannel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* ignore */
      }
      this.pc = null;
    }
    this.peerId = null;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.queuedRemoteCandidates = [];
  }

  private setState(next: CallState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit("callState", next);
  }

  private emit<E extends keyof CallEvents>(
    event: E,
    value: CallEvents[E],
  ): void {
    for (const h of this.handlers[event] as Set<Handler<CallEvents[E]>>) {
      try {
        h(value);
      } catch (err) {
        console.error("call handler threw:", err);
      }
    }
  }
}
