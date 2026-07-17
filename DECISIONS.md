# Decisions

Design notes and reasoning for DuoCall.

## Architecture

```
                    ┌──────────────────────────────┐
                    │   Node signaling server      │
                    │   Fastify + @fastify/ws      │
                    └──────────────────────────────┘
                        ▲                      ▲
                        │  WebSocket           │  WebSocket
                        │  (SDP + ICE)         │  (SDP + ICE)
                        ▼                      ▼
                 ┌────────────┐          ┌────────────┐
                 │            │  audio   │            │
                 │  Browser A │◄════════►│  Browser B │
                 │            │  (SRTP)  │            │
                 └─────┬──────┘          └──────┬─────┘
                       │                        │
                       │  STUN lookup           │  STUN lookup
                       ▼                        ▼
                    ┌──────────────────────────────┐
                    │   stun.l.google.com:19302    │
                    │   (public IP:port discovery) │
                    └──────────────────────────────┘
```

**How it works:** browsers exchange SDP + ICE candidates via the signaling server over WebSocket. Each browser also asks STUN for its public address. Once ICE picks a working candidate pair, audio flows peer-to-peer over encrypted UDP (SRTP). The signaling server never sees media.

**What each piece does:**

- **WebRTC** — browser API for real-time media. Also gives us the data channel we use for captions.
- **STUN** — one-packet exchange that tells your device its public IP:port. Free, ambient infrastructure.
- **ICE** — algorithm inside each browser that gathers candidate addresses, tries every pair via STUN pings, and picks the winner.
- **WebSocket** — persistent bidirectional TCP channel that relays signaling messages between peers.
- **SRTP** — encrypted RTP; the actual audio-carrying protocol. Keys derived from a DTLS handshake.

## Core decisions

Ordered from most to least architecturally impactful.

- **P2P, no media server.** The single biggest call. 1:1 doesn't need an SFU, so zero server bandwidth for audio and the lowest possible latency. Everything else in the system — cost, scale shape, ops burden — flows from this. SFU only becomes necessary at 4+ participants.

- **Signaling → WebSocket.** The transport that makes peer discovery possible. Bidirectional, persistent, low per-message overhead. HTTP polling wastes cycles; SSE is one-way. Signaling volume is dozens of messages per call — latency matters, bandwidth does not.

- **Perfect negotiation (polite / impolite).** Without this, P2P calls fail on glare (both sides offering at once). Newer joiner is "impolite" and initiates the offer; older is "polite" and yields on collision. Handles the case without complex retry logic. Directly affects whether calls actually work.

- **Session tokens + 15s grace-period reconnect.** The single biggest UX quality lever. On WebSocket drop the server holds the slot for 15s. Client reconnects with its token, reattaches to the same `clientId`, and the peer never sees a disconnect. Matches Slack / Discord / Meet.

- **Server-generated room IDs (`nanoid(21)`).** Security-critical. ~149 bits of entropy — non-guessable. Server stores each ID so `join` validates the room exists (prevents brute-forced squatting). Creation rate-limited per IP.

- **App-level heartbeats (25s pings).** Proxies (Fly, Cloudflare, most CDNs) idle-timeout WebSockets around 60s. Explicit pings keep the pipe warm and give deterministic disconnect detection instead of waiting on TCP timeouts.

- **In-memory room state.** Big trade-off for MVP simplicity vs multi-node scale. Rooms don't survive a server restart, and horizontal scaling requires moving into Redis. Fine for MVP; see scaling below.

- **Raw WebRTC + WebSocket APIs, no wrappers.** Skipped `simple-peer`, `PeerJS`, `socket.io` deliberately. Wrappers hide the exact concepts — offer/answer, ICE, connection state — that make the code demonstrably correct. Cost: ~150 lines of client, ~100 of server.

- **Fastify over Express.** Framework ergonomics. Async-native, first-party `@fastify/websocket` plugin, structured JSON logs (pino), schema validation. Express predates async/await.

- **Live captions via WebRTC data channel + browser SpeechRecognition.** Layered demo/verification feature.

## What breaks at 10k rooms/day

- **STUN** — free and unlimited; not a bottleneck.
- **Signaling** — holds up on a single node at this scale (~20k concurrent WebSockets at peak: 10k rooms × 2 peers × ~10 min avg). Would hit vertical limits around ~100k concurrent connections and force a horizontal split — which then also runs into the "In-memory rooms" problem below.
- **In-memory rooms** — breaks the moment you scale to a second signaling node. Fix: move room state management into Redis with pub/sub so any node can serve any room.
- **Rate limiting** — same fix; move in-memory rate limit counters to shared global state in Redis.
- **TURN** — the real cost driver (see next).

## Keeping costs sane

- **STUN is free forever.** Google's public server or a self-hosted `coturn` on a $5 VM.
- **Signaling is trivially cheap.** One small Node process handles thousands of concurrent WebSockets. Fly's smallest VM covers MVP scale.
- **TURN dominates.** At ~$0.40–$1/GB, ~20% of calls × 10k rooms/day × 10 min × ~128 kbps ≈ 2.6 TB/month ≈ **$1k–$2.5k/mo**. Everything else is negligible next to this.
- **Optimizations:** STUN-first in the ICE server list (only fall back to TURN when P2P fails), regional TURN pops to shorten paths and reduce per-region egress, edge-priced providers like Cloudflare Calls.

## TURN in "real life"

DuoCall ships STUN-only — ~20% of users on restrictive NATs / corporate firewalls would fail to connect. Production would add TURN with three transport modes:

1. **TURN over UDP** — fastest fallback; handles symmetric NAT.
2. **TURN over TCP** — for networks blocking UDP entirely.
3. **TURN over TLS on 443** — indistinguishable from HTTPS; survives deep-packet-inspecting corporate firewalls.

Provider options:

- **Managed** — Twilio, Cloudflare Calls TURN, Xirsys, Metered. Fastest to ship; per-GB pricing.
- **Self-hosted `coturn`** — cheaper at scale; ops burden.

Adding TURN is one line — extra entries in the `iceServers` list passed to `RTCPeerConnection`. ICE handles the rest: prefers cheaper candidates first, only falls back to relay when needed.
