/// <reference types="vite/client" />

export interface UrlEnv {
  VITE_SERVER_URL?: string;
  DEV: boolean;
}

export interface UrlLocation {
  origin: string;
  protocol: string;
  hostname: string;
}

export function deriveServerUrls(
  env: UrlEnv,
  location: UrlLocation,
): { http: string; ws: string } {
  const rawBase =
    env.VITE_SERVER_URL ??
    (env.DEV
      ? `${location.protocol}//${location.hostname}:8080`
      : location.origin);
  const http = rawBase.replace(/\/$/, "");
  const ws = http.replace(/^http/, "ws") + "/ws";
  return { http, ws };
}

const derived = deriveServerUrls(import.meta.env, window.location);

export const SERVER_HTTP = derived.http;
export const SERVER_WS = derived.ws;

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];
