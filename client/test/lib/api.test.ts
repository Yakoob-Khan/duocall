import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoom } from "../../src/lib/api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createRoom", () => {
  it("POSTs to /api/rooms and returns the roomId", async () => {
    const fetchMock = mockFetch(
      new Response(JSON.stringify({ roomId: "abc123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await createRoom();

    expect(result).toEqual({ roomId: "abc123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/api/rooms");
    expect(init).toMatchObject({ method: "POST" });
  });

  it("throws with a descriptive message on non-ok status", async () => {
    mockFetch(
      new Response("rate limited", {
        status: 429,
        statusText: "Too Many Requests",
      }),
    );

    await expect(createRoom()).rejects.toThrow(
      /Failed to create room \(429\): rate limited/,
    );
  });

  it("falls back to statusText when response body is empty", async () => {
    mockFetch(
      new Response("", { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(createRoom()).rejects.toThrow(
      /Failed to create room \(500\): Internal Server Error/,
    );
  });

  it("propagates a network-level rejection", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createRoom()).rejects.toThrow("network down");
  });
});
