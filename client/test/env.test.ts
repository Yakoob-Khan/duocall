import { describe, it, expect } from "vitest";
import { deriveServerUrls } from "../src/env";

const loc = (url: string) => {
  const u = new URL(url);
  return { origin: u.origin, protocol: u.protocol, hostname: u.hostname };
};

describe("deriveServerUrls", () => {
  it("uses VITE_SERVER_URL when provided (highest priority)", () => {
    const { http, ws } = deriveServerUrls(
      { VITE_SERVER_URL: "https://api.duocall.dev", DEV: false },
      loc("https://example.com/"),
    );
    expect(http).toBe("https://api.duocall.dev");
    expect(ws).toBe("wss://api.duocall.dev/ws");
  });

  it("strips trailing slash from VITE_SERVER_URL", () => {
    const { http } = deriveServerUrls(
      { VITE_SERVER_URL: "https://api.duocall.dev/", DEV: false },
      loc("https://example.com/"),
    );
    expect(http).toBe("https://api.duocall.dev");
  });

  it("in dev, falls back to http(s)://<hostname>:8080", () => {
    const { http, ws } = deriveServerUrls(
      { DEV: true },
      loc("http://localhost:5173/foo"),
    );
    expect(http).toBe("http://localhost:8080");
    expect(ws).toBe("ws://localhost:8080/ws");
  });

  it("in dev, respects HTTPS from the current location's protocol", () => {
    const { http, ws } = deriveServerUrls(
      { DEV: true },
      loc("https://dev.example.com/foo"),
    );
    expect(http).toBe("https://dev.example.com:8080");
    expect(ws).toBe("wss://dev.example.com:8080/ws");
  });

  it("in prod, defaults to the current window origin", () => {
    const { http, ws } = deriveServerUrls(
      { DEV: false },
      loc("https://duocall.fly.dev/room/abc"),
    );
    expect(http).toBe("https://duocall.fly.dev");
    expect(ws).toBe("wss://duocall.fly.dev/ws");
  });

  it("http origin becomes ws:// scheme", () => {
    const { ws } = deriveServerUrls({ DEV: false }, loc("http://example.com/"));
    expect(ws).toBe("ws://example.com/ws");
  });

  it("VITE_SERVER_URL overrides DEV/prod branch entirely", () => {
    const { http } = deriveServerUrls(
      { VITE_SERVER_URL: "https://staging.duocall.dev", DEV: true },
      loc("http://localhost:5173/"),
    );
    expect(http).toBe("https://staging.duocall.dev");
  });
});
