# DuoCall — MVP Plan

A 1:1 WebRTC audio calling app. This document is a working plan; iterate freely.

## Product scope

- Two users open the same room URL and can hold an audio call.
- UI shows join/leave, mute/unmute, connection status, and surfaces common errors.
- No accounts, no persistence, no group calls, no chat, no recording.

## Architecture at a glance

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

**How to read this:**
1. Both browsers connect to the signaling server over WebSocket. The server relays SDP offers/answers and ICE candidates — nothing else. It never sees audio.
2. Each browser separately asks STUN for its public address, learned addresses are shared via signaling as ICE candidates.
3. Once ICE picks a working candidate pair, audio flows **directly** peer-to-peer over encrypted SRTP/UDP. The signaling server sits idle for the rest of the call.
4. No TURN in MVP — flagged as a known limitation in DECISIONS.md.

## Tech stack

**Backend (signaling)**
- Node.js + TypeScript
- Fastify for the HTTP surface: health check + serving the built frontend in prod
- `@fastify/websocket` (wraps `ws`) for the signaling channel
- `nanoid` for non-guessable room IDs
- In-memory `Map<roomId, Set<clientId>>` for room membership

**Frontend**
- Vite + React + TypeScript
- Native browser APIs: `RTCPeerConnection`, `getUserMedia`, `WebSocket`
- No WebRTC wrapper libraries (write against raw APIs)
- Tailwind CSS for styling — aiming for a polished, modern UI

**Infra**
- Single Dockerfile, deployed to Fly.io (WebSocket-native, cheap)
- STUN: `stun:stun.l.google.com:19302`

## Signaling protocol (WebSocket messages)

All messages are JSON with a `type` field.

### Client → server
- `{ type: "join", roomId }` — request to join a room
- `{ type: "resume", token }` — reattach an existing session after a drop
- `{ type: "leave" }` — leave current room
- `{ type: "signal", to: peerId, payload }` — relay SDP offer/answer or ICE candidate to peer
- `{ type: "ping" }` — keepalive

### Server → client
- `{ type: "joined", roomId, self: clientId, token, peers: [clientId] }` — join succeeded; `token` is the session token to save for reconnects
- `{ type: "resumed", roomId, self: clientId, peers: [clientId] }` — resume succeeded, session reattached
- `{ type: "peer-joined", peerId }` — someone else joined the room
- `{ type: "peer-left", peerId }` — someone else left
- `{ type: "signal", from: peerId, payload }` — relayed signaling message
- `{ type: "error", code, message }` — room full, invalid ID, expired session, etc.
- `{ type: "pong" }` — keepalive response

### Waiting state (event-driven)
- After the first peer joins, the client sits in a "waiting for peer" UI. No polling.
- When the second peer joins, the server pushes `{ type: "peer-joined", peerId }` over the existing WebSocket to the first peer.
- That event flips the first peer's UI out of "waiting" and triggers `createOffer` → SDP exchange.
- Rationale: WebSocket is already open and bidirectional; the server knows the exact moment the second peer joins. Polling would waste requests and add latency to call setup.

### Heartbeats
- Client sends `{ type: "ping" }` every **25 seconds**; server replies with `{ type: "pong" }`.
- Server tracks last-seen per client. If no message received for **60 seconds**, server closes the socket and emits `peer-left` to the other peer.
- Client that misses **2 consecutive pongs** treats the connection as dead, closes it, and triggers reconnect.
- Rationale: many proxies/load balancers idle-timeout WebSockets around 60s (Fly.io, Cloudflare, most CDNs). App-level pings keep the pipe warm and give both sides fast, deterministic disconnect detection instead of waiting on TCP timeouts.

### Reconnection (graceful reattach)
- On successful `join`, server generates a session token (`nanoid(32)`) and returns it in the `joined` message. Client keeps it in memory only (session-scoped).
- If the WebSocket drops, the server does **not** immediately evict the peer. It marks the peer as `disconnected` and starts a **15-second grace timer**. The room slot stays reserved.
- Client attempts to reconnect with exponential backoff (starts at 500ms, caps at 4s) and on the new socket sends `{ type: "resume", token }`.
- If the server matches the token within the grace window → reattaches the socket to the existing clientId, replies `resumed`, cancels the eviction timer. **No `peer-left` fires** on the other peer's side.
- If the grace window expires → server evicts the peer, invalidates the token, and emits `peer-left` to the other peer. A later `resume` with that token gets `error: "session-expired"`.
- The audio (SRTP) itself is unaffected by short WebSocket drops — this only preserves signaling continuity for mute toggles, ICE restart, and clean hangup.
- Rationale: matches production apps (Slack, Discord, Meet). Brief network hiccups don't tear down the call. Small server state cost, big UX win.

### Room lifecycle
- Rooms are created **server-side** via `POST /api/rooms`. Server generates the ID with `nanoid(21)`, stores it, returns `{ roomId }`.
- Room capacity: **2**. Third join gets `error: "room-full"`.
- Joining a non-existent room ID → `error: "invalid-room"`. This lets us rate-limit creation and prevents brute-forced room squatting.
- Room is destroyed when the last peer leaves (or after a TTL if never joined — e.g. 10 min).

## Room ID security
- `nanoid(21)` → ~149 bits of entropy. Non-guessable, URL-safe.
- Validate format on join (regex `^[A-Za-z0-9_-]{21}$`) before any allocation.
- Rate-limit joins per IP (simple in-memory counter).

## Build order

### Phase 1 — Signaling server (backend first)
1. Bootstrap: `pnpm init`, TS config, Fastify + ws.
2. HTTP: `POST /api/rooms` returns `{ roomId }`.
3. WebSocket endpoint at `/ws`.
4. Implement message handling: join, leave, signal relay.
5. Presence: emit `peer-joined` / `peer-left` events.
6. Test with `wscat` or a throwaway HTML file.

### Phase 2 — Client core (WebRTC plumbing, no UI polish)
1. Vite + React + TS scaffold.
2. WebSocket client wrapper with reconnect.
3. `RTCPeerConnection` setup + `getUserMedia({ audio: true })`.
4. Offer/answer flow triggered when 2nd peer joins.
5. ICE candidate exchange over the signaling channel.
6. Confirm audio flows in two browser windows on the same laptop.

### Phase 3 — UI + UX
1. Home page: "Create room" button → generates room ID, navigates to `/room/:id`.
2. Room page: shows room link (copyable), waiting state, in-call state.
3. Controls: mute/unmute, leave.
4. Connection status: connecting / connected / reconnecting / failed.
5. Error surfaces: mic permission denied, room full, peer disconnected.

### Phase 4 — Deployment + docs
1. Dockerfile: build frontend, serve via Fastify static in prod.
2. Deploy to Fly.io.
3. Write README.md (run locally, features, skipped).
4. Write DECISIONS.md (transport choice, scaling, TURN, cost).

## Error surfaces (must handle)

| Error | Where | UX |
|---|---|---|
| Mic permission denied | `getUserMedia` rejects | Banner: "Enable microphone in browser settings" |
| Signaling server unreachable | WebSocket close/error | Banner: "Reconnecting..." + retry with backoff |
| Room full | `error: "room-full"` from server | Redirect to home with toast |
| Invalid room ID | `error: "invalid-room"` | Redirect to home |
| Peer left | `peer-left` event | Show "Peer disconnected", stay in room |
| ICE failed (no TURN) | `connectionState === "failed"` | Show "Couldn't connect. This can happen on restrictive networks." |

## Explicit non-goals for MVP

- No TURN server (call out in DECISIONS.md; explain the ~20% failure case)
- No video (audio only; the spec says video is optional)
- No auth / users / persistence
- No group calls (SFU/MCU discussion belongs in DECISIONS.md, not code)
- No chat, screen share, or recording
- No mobile-native app

## Open questions / things to iterate on

_(none right now — add here as they come up)_
