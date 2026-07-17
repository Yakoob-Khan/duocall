import { WebSocket, type RawData } from "ws";
import type { ClientMessage, ServerMessage } from "../src/types.js";

const base = process.env.BASE ?? "http://localhost:8080";
const wsUrl = base.replace(/^http/, "ws") + "/ws";

type TrackedSocket = WebSocket & { messages: ServerMessage[] };

async function createRoom(): Promise<string> {
  const res = await fetch(`${base}/api/rooms`, { method: "POST" });
  if (!res.ok) throw new Error(`create room failed: ${res.status}`);
  const data = (await res.json()) as { roomId: string };
  return data.roomId;
}

function connect(label: string): Promise<TrackedSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl) as TrackedSocket;
    ws.messages = [];
    ws.on("message", (data: RawData) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      console.log(`[${label}] <-`, msg);
      ws.messages.push(msg);
    });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function send(ws: TrackedSocket, msg: ClientMessage): void {
  console.log(`-> ${msg.type}`);
  ws.send(JSON.stringify(msg));
}

function waitFor<T extends ServerMessage["type"]>(
  ws: TrackedSocket,
  type: T,
  ms = 2000,
): Promise<Extract<ServerMessage, { type: T }>> {
  type Wanted = Extract<ServerMessage, { type: T }>;
  return new Promise((resolve, reject) => {
    const found = ws.messages.find((m) => m.type === type);
    if (found) return resolve(found as Wanted);
    const handler = (data: RawData) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      if (msg.type === type) {
        ws.off("message", handler);
        resolve(msg as Wanted);
      }
    };
    ws.on("message", handler);
    setTimeout(() => {
      ws.off("message", handler);
      reject(new Error(`Timeout waiting for ${type}`));
    }, ms);
  });
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  console.log("=== creating room ===");
  const roomId = await createRoom();
  console.log("roomId:", roomId);

  console.log("\n=== A joins ===");
  const a = await connect("A");
  send(a, { type: "join", roomId });
  const aJoined = await waitFor(a, "joined");
  const aId = aJoined.self;
  const aToken = aJoined.token;

  console.log("\n=== B joins ===");
  const b = await connect("B");
  send(b, { type: "join", roomId });
  const bJoined = await waitFor(b, "joined");
  await waitFor(a, "peer-joined");

  console.log("\n=== signaling relay ===");
  send(a, {
    type: "signal",
    to: bJoined.self,
    payload: { kind: "offer", sdp: "fake-sdp-a-offer" },
  });
  await waitFor(b, "signal");

  console.log("\n=== ping/pong ===");
  send(a, { type: "ping" });
  await waitFor(a, "pong");

  console.log("\n=== C joins full room (should error) ===");
  const c = await connect("C");
  send(c, { type: "join", roomId });
  await waitFor(c, "error");
  c.close();

  console.log("\n=== A disconnects, resumes within grace ===");
  a.close();
  await sleep(500);
  const aReconnect = await connect("A2");
  send(aReconnect, { type: "resume", token: aToken });
  const resumed = await waitFor(aReconnect, "resumed");
  if (resumed.self !== aId) throw new Error("clientId changed on resume");

  console.log("\n=== leave ===");
  send(aReconnect, { type: "leave" });
  await waitFor(b, "peer-left");

  console.log("\n=== all checks passed ===");
  aReconnect.close();
  b.close();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("FAIL:", err);
  process.exit(1);
});
