import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SERVER_WS, ICE_SERVERS } from "../env";
import { SignalingClient, type ConnectionState } from "../lib/signaling";
import { CallController, type CallState } from "../lib/rtc";

export function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [connState, setConnState] = useState<ConnectionState>("idle");
  const [callState, setCallState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const callRef = useRef<CallController | null>(null);

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    const signaling = new SignalingClient({ url: SERVER_WS });
    const call = new CallController({ signaling, iceServers: ICE_SERVERS });
    signalingRef.current = signaling;
    callRef.current = call;

    const offs = [
      signaling.on("connectionState", setConnState),
      call.on("callState", setCallState),
      call.on("remoteStream", (stream) => {
        if (audioRef.current) audioRef.current.srcObject = stream;
      }),
      call.on("error", (e) => setError(`${e.code}: ${e.message}`)),
    ];

    (async () => {
      try {
        await call.acquireMic();
      } catch {
        // error already surfaced via event
        return;
      }
      if (cancelled) return;
      signaling.joinRoom(roomId);
    })();

    return () => {
      cancelled = true;
      for (const off of offs) off();
      call.close();
      signaling.close();
      signalingRef.current = null;
      callRef.current = null;
    };
  }, [roomId]);

  const toggleMute = () => {
    const next = !muted;
    callRef.current?.setMuted(next);
    setMuted(next);
  };

  const handleLeave = () => {
    callRef.current?.close();
    signalingRef.current?.leave();
    navigate("/");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 480 }}>
      <h1>Room</h1>
      <p style={{ fontFamily: "monospace" }}>{roomId}</p>

      <p>
        <strong>Signaling:</strong> {connState}
        <br />
        <strong>Call:</strong> {callState}
        {muted && callState === "connected" && "  (mic muted)"}
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={copyLink}>{copied ? "Copied!" : "Copy invite link"}</button>
        <button onClick={toggleMute} disabled={callState !== "connected"}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button onClick={handleLeave}>Leave</button>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}

      <audio ref={audioRef} autoPlay playsInline />
    </main>
  );
}
