import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { RoomManager } from "./rooms.js";
import { registerSignaling } from "./signaling.js";

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty", options: { colorize: true } },
    },
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      try {
        const url = new URL(origin);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
          return cb(null, true);
        }
      } catch {}
      cb(null, false);
    },
  });

  await app.register(rateLimit, {
    global: false,
    max: config.createRoomsPerMinute,
    timeWindow: "1 minute",
  });

  await app.register(websocket);

  const rooms = new RoomManager();

  const staleSweep = setInterval(() => rooms.sweepStaleClients(), 5_000);
  app.addHook("onClose", async () => {
    clearInterval(staleSweep);
  });

  app.get("/healthz", async () => ({ ok: true }));

  app.post(
    "/api/rooms",
    { config: { rateLimit: { max: config.createRoomsPerMinute, timeWindow: "1 minute" } } },
    async () => {
      const roomId = rooms.createRoom();
      return { roomId };
    },
  );

  registerSignaling(app, rooms);

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
