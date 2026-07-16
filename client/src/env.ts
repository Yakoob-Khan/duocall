/// <reference types="vite/client" />

const rawBase =
  import.meta.env.VITE_SERVER_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8080`
    : "http://localhost:8080");

export const SERVER_HTTP = rawBase.replace(/\/$/, "");
export const SERVER_WS = SERVER_HTTP.replace(/^http/, "ws") + "/ws";

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];
