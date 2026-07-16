import { WebSocket } from "ws";

const base = process.env.BASE ?? "http://localhost:8080";
const wsUrl = base.replace(/^http/, "ws") + "/ws";

const createRoom = async () => {
  const res = await fetch(`${base}/api/rooms`, { method: "POST" });
  const { roomId } = await res.json();
  return roomId;
};

const connect = (label) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.messages = [];
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      console.log(`[${label}] <-`, msg);
      ws.messages.push(msg);
    });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });

const send = (ws, msg) => {
  console.log(`-> ${msg.type}`);
  ws.send(JSON.stringify(msg));
};

const waitFor = (ws, type, ms = 2000) =>
  new Promise((resolve, reject) => {
    const found = ws.messages.find((m) => m.type === type);
    if (found) return resolve(found);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        ws.off("message", handler);
        resolve(msg);
      }
    };
    ws.on("message", handler);
    setTimeout(() => {
      ws.off("message", handler);
      reject(new Error(`Timeout waiting for ${type}`));
    }, ms);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
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
  await waitFor(b, "joined");
  await waitFor(a, "peer-joined");

  console.log("\n=== signaling relay ===");
  send(a, {
    type: "signal",
    to: b.messages.find((m) => m.type === "joined").self,
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

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
