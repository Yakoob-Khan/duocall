import { SERVER_HTTP } from "../env";

export async function createRoom(): Promise<{ roomId: string }> {
  const res = await fetch(`${SERVER_HTTP}/api/rooms`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to create room (${res.status}): ${text || res.statusText}`,
    );
  }
  return res.json();
}
