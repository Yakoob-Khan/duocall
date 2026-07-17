# DuoCall

A minimal 1:1 audio calling app built with WebRTC.

**Live demo:** https://duocall.fly.dev/

## What was built

- 1:1 audio calls over WebRTC (peer-to-peer; no media server)
- Room-based flow — create a room, share the URL, second person joins
- Server-generated, non-guessable room IDs (21-char `nanoid`)
- WebSocket signaling with heartbeats and graceful reconnect (session-token resume within a 15s grace period)
- Presence events (`peer-joined`, `peer-left`)
- UI status indicators — signaling state, call state, live speaking indicator, mute
- Live captions using the browser's SpeechRecognition API + a WebRTC data channel — visual proof that audio content is being transmitted
- Clean error surfaces — mic permission denied, room full, invalid room, ICE failed, signaling reconnecting
- Dark-themed responsive UI with Tailwind CSS
- Unit tests for client and server; an end-to-end integration test for the full signaling protocol
- Deployed to Fly.io

## Tech stack

- **Real-time media** — WebRTC
- **Signaling transport** — WebSocket
- **STUN** — Google's public STUN server
- **Server** — Node.js, TypeScript, Fastify/Websocket
- **Client** — Vite, React, TypeScript, Tailwind CSS
- **Deploy** — Docker + Fly.io

## Run locally

Requirements: Node 20+, npm.

**Terminal 1 — server:**

```bash
cd server
npm install
npm run dev              # http://localhost:8080
```

**Terminal 2 — client:**

```bash
cd client
npm install
npm run dev              # http://localhost:5173
```

Then:

1. Open http://localhost:5173 in **two different browsers** (or one normal window + one private window — same-profile tabs share the mic and confuse things)
2. Window A → click **Create a room** → grant microphone access
3. Copy the invite link → open it in window B → grant mic there too
4. Both windows should transition to **In call**; speak into one and hear it in the other

## Testing

```bash
# Client tests (Vitest + Testing Library)
cd client && npm test

# Server unit tests (Vitest)
cd server && npm test

# End-to-end integration test — requires the server running on :8080
cd server && npm run test:integration
```

## What was skipped

- **TURN server** — only STUN is configured; roughly 20% of users on restrictive NATs or corporate firewalls would fail to connect
- **Video** — only audio supported
- **Group calls (3+ participants)** — 1:1 by design, no SFU or MCU
- **Authentication / user accounts** — rooms are ephemeral and unauthenticated
- **Persistence** — room state lives in memory; a server restart drops all rooms
- **Chat, screen share, recording** — out of scope
- **Mobile-native app** — browser-only

## Project structure

```
duocall/
├── client/           # Vite + React + TypeScript frontend
│   ├── src/
│   └── test/
├── server/           # Node.js signaling server
│   ├── src/
│   └── test/
├── PLAN.md           # design notes and MVP plan
├── DECISIONS.md      # tradeoffs, scaling, TURN strategy, cost
├── Dockerfile        # multi-stage build (client + server → runtime)
└── fly.toml          # Fly.io app config
```

## Deployment

Deployed to Fly.io. To ship a new version:

```bash
fly deploy
```

The Dockerfile builds the client, builds the server, and copies both into a runtime image. In production the Fastify server serves the HTTP API, the WebSocket signaling channel, and the built React app on the same origin.

## Docs

- **[PLAN.md](./PLAN.md)** — MVP plan, signaling protocol, error surfaces (built with Claude Code)
- **[DECISIONS.md](./DECISIONS.md)** — tradeoffs, scaling to 10k rooms/day, TURN strategy, cost math
