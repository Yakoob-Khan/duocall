# CLAUDE.md

Project-scoped context for Claude Code sessions on this repo.

## What DuoCall is

Minimal 1:1 audio calling app built with WebRTC. Take-home assignment scope.

- Live: https://duocall.fly.dev
- Repo: https://github.com/Yakoob-Khan/duocall

## Directory layout

- `client/` — Vite + React + TS frontend
- `server/` — Fastify + TypeScript signaling server
- `notes/` — assignment brief (`assignment.md`) + session learnings (`LEARNINGS.md`)
- `PLAN.md` — MVP plan, signaling protocol, error surfaces (iterated with Claude Code)
- `DECISIONS.md` — architecture tradeoffs, scaling, TURN, cost
- `Dockerfile` — multi-stage build (client + server → runtime image)
- `fly.toml` — Fly.io app config
- `DuoCall.gif` — demo recording embedded in the README

## Tech stack

- **Server**: Node 22, TypeScript, Fastify, `@fastify/websocket`, `nanoid`
- **Client**: Vite, React, TypeScript, Tailwind CSS, lucide-react, react-router-dom
- **Signaling**: WebSocket
- **STUN**: Google public (`stun.l.google.com:19302`) — no TURN configured
- **Testing**: Vitest + `@testing-library/react` + jsdom (client), Vitest (server)
- **Deploy**: Docker + Fly.io

## Non-obvious conventions

- **Raw WebRTC + WebSocket APIs, no wrappers.** No `simple-peer`, `PeerJS`, or `socket.io`. Deliberate — see DECISIONS.md.
- **Const-object-as-const enums**, not the TypeScript `enum` keyword. See `CallState` and `ConnectionState` in `client/src/lib/`.
- **Separate `test/` directories** with `../src/...` imports rather than colocated tests. Both client and server follow this pattern.
- **In-memory room state** on the server. No database. Trade-off documented in DECISIONS.md.
- **Microphone is app-lifetime resource**, owned by `MicProvider` in `client/src/hooks/useMic.tsx`. Never acquired per-call.
- **Perfect negotiation** (polite/impolite roles) handles offer/answer glare in `client/src/lib/rtc.ts`.
- **Session tokens + 15s grace period reconnect**. Transient WebSocket drops don't tear down calls.
- **Fastify plugins registered as one-liners** — CORS, rate limit, WebSocket, static file serving.
- **`process.env` reads centralized in `server/src/config.ts`** — no direct env access elsewhere.
- **NodeNext module resolution** — imports need `.js` extensions on the server side (`from "./rooms.js"`).

## Known gotchas

- **Chrome regular + Chrome incognito** tabs cannot connect to each other. mDNS profile isolation — a Chrome privacy feature, not a bug. Use Chrome + Safari (or Firefox) to test locally.
- **SpeechRecognition** (live captions) is Chrome / Edge only. Firefox shows a graceful fallback.
- **No TURN configured** — ~20% of real users on restrictive NATs / corporate firewalls would fail. Documented gap in DECISIONS.md.
- **Vite dev HMR** doesn't cleanly hot-swap changes to `main.tsx` or context providers — hard-refresh after those changes.
- **`GITHUB_TOKEN` env var** is broken in this user's shell. `gh` picks it up first and fails. Use `env -u GITHUB_TOKEN gh ...` as workaround.

## Commands

```bash
# Client
cd client && npm run dev              # http://localhost:5173
cd client && npm test                 # Vitest
cd client && npm run typecheck        # tsc --noEmit

# Server
cd server && npm run dev              # http://localhost:8080
cd server && npm test                 # Vitest unit
cd server && npm run test:integration # end-to-end signaling test (requires server on :8080)
cd server && npm run typecheck        # tsc --noEmit on src + test

# Deploy
fly deploy                            # rolling deploy from repo root
fly logs                              # tail live logs
fly status                            # release + machine status

# Git
git push                              # main tracks origin/main
```

## Style expectations

The user prefers:

- Terse, bullet-pointed explanations over long paragraphs
- Reasoning ("why") alongside the "what"
- Small focused commits with imperative messages ("Add X", "Fix Y")
- Being told when a technical choice deviates from current industry best practice

Cross-session preferences live in `~/.claude/projects/-Users-yakoobkhan-Desktop-yk-dev/memory/` — those apply to all sessions, not just this repo.
