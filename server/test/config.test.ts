import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * config.ts reads process.env at module load. To test different env values we
 * reset the module cache and re-import inside each test.
 */
async function loadConfig(env: Record<string, string | undefined>) {
  const original = { ...process.env };
  // Wipe env vars we care about, then apply the test's values.
  for (const k of ["NODE_ENV", "PORT", "HOST", "LOG_LEVEL"]) {
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  const mod = await import("../src/config.js");
  process.env = original;
  return mod.config;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

describe("config.ts defaults", () => {
  it("uses default port 8080, host 0.0.0.0, log level info", async () => {
    const config = await loadConfig({});
    expect(config.port).toBe(8080);
    expect(config.host).toBe("0.0.0.0");
    expect(config.logLevel).toBe("info");
  });

  it("defaults nodeEnv to 'development' and isProduction to false", async () => {
    const config = await loadConfig({});
    expect(config.nodeEnv).toBe("development");
    expect(config.isProduction).toBe(false);
  });
});

describe("config.ts env overrides", () => {
  it("PORT env var overrides default port", async () => {
    const config = await loadConfig({ PORT: "9000" });
    expect(config.port).toBe(9000);
  });

  it("HOST env var overrides default host", async () => {
    const config = await loadConfig({ HOST: "127.0.0.1" });
    expect(config.host).toBe("127.0.0.1");
  });

  it("LOG_LEVEL env var overrides default log level", async () => {
    const config = await loadConfig({ LOG_LEVEL: "debug" });
    expect(config.logLevel).toBe("debug");
  });
});

describe("config.ts NODE_ENV branching", () => {
  it("NODE_ENV=production sets isProduction=true", async () => {
    const config = await loadConfig({ NODE_ENV: "production" });
    expect(config.nodeEnv).toBe("production");
    expect(config.isProduction).toBe(true);
  });

  it("NODE_ENV=test sets isProduction=false", async () => {
    const config = await loadConfig({ NODE_ENV: "test" });
    expect(config.nodeEnv).toBe("test");
    expect(config.isProduction).toBe(false);
  });

  it("NODE_ENV=development sets isProduction=false", async () => {
    const config = await loadConfig({ NODE_ENV: "development" });
    expect(config.nodeEnv).toBe("development");
    expect(config.isProduction).toBe(false);
  });
});

describe("config.ts static room settings", () => {
  it("exposes room-related constants (nanoid lengths, capacity, timers)", async () => {
    const config = await loadConfig({});
    expect(config.roomIdLength).toBe(21);
    expect(config.clientIdLength).toBe(16);
    expect(config.sessionTokenLength).toBe(32);
    expect(config.roomCapacity).toBe(2);
    expect(config.gracePeriodMs).toBe(15_000);
    expect(config.heartbeatTimeoutMs).toBe(60_000);
  });
});
