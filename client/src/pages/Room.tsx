import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Check, Copy, WifiOff } from "lucide-react";
import { SERVER_WS, ICE_SERVERS } from "../env";
import { SignalingClient, ConnectionState } from "../lib/signaling";
import { CallController, CallState } from "../lib/rtc";
import { Header } from "../components/Header";
import { PeerCircle } from "../components/PeerCircle";
import { ControlBar } from "../components/ControlBar";
import { MicDenied } from "../components/MicDenied";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";

type FatalErrorCode = "room-full" | "invalid-room" | "session-expired";
const FATAL_ERROR_CODES: readonly FatalErrorCode[] = [
  "room-full",
  "invalid-room",
  "session-expired",
] as const;

export function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [connState, setConnState] = useState<ConnectionState>(
    ConnectionState.Idle,
  );
  const [callState, setCallState] = useState<CallState>(CallState.Idle);
  const [muted, setMuted] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteCaption, setRemoteCaption] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const callRef = useRef<CallController | null>(null);

  const isRemoteSpeaking = useAudioLevel(remoteStream);

  const isConnected = callState === CallState.Connected;
  const { supported: sttSupported } = useSpeechRecognition({
    enabled: isConnected && !muted,
    onTranscript: (text, final) => {
      callRef.current?.sendCaption(text, final);
    },
  });

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
        setRemoteStream(stream);
        if (!stream) setRemoteCaption(null);
      }),
      call.on("caption", ({ text }) => setRemoteCaption(text)),
      call.on("error", (e) => {
        if (FATAL_ERROR_CODES.includes(e.code as FatalErrorCode)) {
          navigate(`/?error=${e.code}`, { replace: true });
        } else if (e.code === "mic-denied") {
          setMicDenied(true);
        } else {
          setErrorBanner(e.message);
        }
      }),
    ];

    (async () => {
      try {
        await call.acquireMic();
      } catch {
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
  }, [roomId, navigate]);

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

  const retryMic = () => {
    setMicDenied(false);
    window.location.reload();
  };

  if (micDenied) {
    return <MicDenied onRetry={retryMic} onCancel={() => navigate("/")} />;
  }

  return (
    <div className="min-h-full flex flex-col">
      <Header connState={connState} />

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        {connState === ConnectionState.Reconnecting && (
          <div
            role="status"
            className="mb-6 flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-1.5 text-sm text-amber-300 ring-1 ring-inset ring-amber-500/30"
          >
            <WifiOff className="h-4 w-4" />
            Reconnecting to server…
          </div>
        )}

        {errorBanner && (
          <div
            role="alert"
            className="mb-6 max-w-md rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{errorBanner}</span>
              <button
                onClick={() => setErrorBanner(null)}
                className="text-rose-300/70 hover:text-rose-100"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <PeerCircle callState={callState} isSpeaking={isRemoteSpeaking} />

        <div className="mt-6 text-center">
          <p className="text-xl font-medium">{stateLabel(callState)}</p>
          <p className="mt-1 text-sm text-slate-400">{stateHint(callState)}</p>
        </div>

        {isConnected && (
          <CaptionOverlay text={remoteCaption} supported={sttSupported} />
        )}

        <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Room ID
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="truncate font-mono text-sm text-slate-300">{roomId}</p>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy invite
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      <ControlBar
        muted={muted}
        canMute={callState === CallState.Connected}
        onToggleMute={toggleMute}
        onLeave={handleLeave}
      />

      <audio ref={audioRef} autoPlay playsInline />
    </div>
  );
}

function stateLabel(state: CallState): string {
  switch (state) {
    case CallState.AcquiringMic:
      return "Getting microphone…";
    case CallState.WaitingForPeer:
      return "Waiting for a peer";
    case CallState.Negotiating:
      return "Connecting…";
    case CallState.Connected:
      return "In call";
    case CallState.Reconnecting:
      return "Reconnecting…";
    case CallState.Failed:
      return "Couldn't connect";
    case CallState.Closed:
      return "Call ended";
    default:
      return "Preparing…";
  }
}

function stateHint(state: CallState): string {
  switch (state) {
    case CallState.WaitingForPeer:
      return "Share the room link below to invite someone.";
    case CallState.Connected:
      return "Audio is flowing peer-to-peer.";
    case CallState.Negotiating:
      return "Establishing the peer-to-peer connection.";
    case CallState.Reconnecting:
      return "Trying to restore the connection.";
    case CallState.Failed:
      return "This can happen on restrictive networks (e.g. corporate firewalls).";
    default:
      return " ";
  }
}
