export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",

  roomIdLength: 21,
  clientIdLength: 16,
  sessionTokenLength: 32,
  roomCapacity: 2,

  gracePeriodMs: 15_000,
  emptyRoomTtlMs: 10 * 60 * 1000,
  heartbeatTimeoutMs: 60_000,

  createRoomsPerMinute: 30,
} as const;

export const ROOM_ID_REGEX = /^[A-Za-z0-9_-]{21}$/;
