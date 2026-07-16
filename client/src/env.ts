/// <reference types="vite/client" />

const rawBase =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:8080`
    : window.location.origin);

export const SERVER_HTTP = rawBase.replace(/\/$/, "");
export const SERVER_WS = SERVER_HTTP.replace(/^http/, "ws") + "/ws";

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];
