# Arena Home Assignment

For this task, you'll build **MiniRTC** — a simple one‑to‑one (1:1) calling product.

## Core user flow

- User creates or joins a room by URL.
- Two users in the same room can start a call (audio required, video optional).
- Show basic call UI:
  - Join/Leave
  - Mute/Unmute
  - Connection Status
  - Handle Common Errors

## Backend

- Any transport that makes sense — we'd love to hear why that transport.
- Room membership tracking, presence events.
- Minimal security: room IDs should be non-guessable or validated.

## Scalability / cost

Write a short section in `DECISIONS.md`:

- What breaks if you had 10k rooms/day?
- How you'd keep costs sane.
- What you'd do about NAT traversal (TURN) in "real life".
- Deploy somewhere (optional but valued).

## Deliverables

- Repo link (or zip).
- `README.md` (run locally, what you built, what you skipped).
- `DECISIONS.md` (tradeoffs, scaling/cost, explain what the different technologies at play actually do).
- Optional: deployed link and/or short demo.

---

*Source: [Arena Home Assignment (Google Doc)](https://docs.google.com/document/d/1mGwf3rTMn2c9YnmyTRAPQvgLoYOZd9_KMsxppvqvrBk/edit?tab=t.0)*
