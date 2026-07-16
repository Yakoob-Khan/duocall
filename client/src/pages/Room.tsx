import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Mic,
  MicOff,
  PhoneOff,
  Copy,
  Check,
  Loader2,
  WifiOff,
  UserRound,
  AlertTriangle,
} from "lucide-react";
import { SERVER_WS, ICE_SERVERS } from "../env";
import { SignalingClient, type ConnectionState } from "../lib/signaling";
import { CallController, type CallState } from "../lib/rtc";

type FatalErrorCode = "room-full" | "invalid-room" | "session-expired";
const FATAL_ERROR_CODES: readonly FatalErrorCode[] = [
  "room-full",
  "invalid-room",
  "session-expired",
] as const;

export function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [connState, setConnState] = useState<ConnectionState>("idle");
  const [callState, setCallState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
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
    // Simplest recovery: reload the page so getUserMedia is re-requested.
    window.location.reload();
  };

  if (micDenied) {
    return <MicDenied onRetry={retryMic} onCancel={() => navigate("/")} />;
  }

  return (
    <div className="min-h-full flex flex-col">
      <Header connState={connState} />

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        {connState === "reconnecting" && (
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

        <PeerCircle callState={callState} />

        <div className="mt-6 text-center">
          <p className="text-xl font-medium">{stateLabel(callState)}</p>
          <p className="mt-1 text-sm text-slate-400">
            {stateHint(callState)}
          </p>
        </div>

        <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Room ID
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="truncate font-mono text-sm text-slate-300">
              {roomId}
            </p>
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
        canMute={callState === "connected"}
        onToggleMute={toggleMute}
        onLeave={handleLeave}
      />

      <audio ref={audioRef} autoPlay playsInline />
    </div>
  );
}

function Header({ connState }: { connState: ConnectionState }) {
  const styles = signalingStyles(connState);
  return (
    <header className="flex items-center justify-between border-b border-slate-900 bg-slate-950/80 px-5 py-3 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <span className="text-sky-400">•</span>
        DuoCall
      </div>
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${styles.chip}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
        {styles.label}
      </div>
    </header>
  );
}

function PeerCircle({ callState }: { callState: CallState }) {
  const connected = callState === "connected";
  const negotiating =
    callState === "negotiating" || callState === "acquiring-mic";
  const waiting = callState === "waiting-for-peer" || callState === "idle";
  const failed = callState === "failed";
  const reconnecting = callState === "reconnecting";

  return (
    <div className="relative">
      {connected && (
        <>
          <span className="absolute inset-0 -m-6 animate-pulse-slow rounded-full bg-emerald-500/10" />
          <span className="absolute inset-0 -m-3 rounded-full bg-emerald-500/20" />
        </>
      )}
      <div
        className={`relative flex h-40 w-40 items-center justify-center rounded-full border-2 transition-colors ${
          connected
            ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
            : failed
              ? "border-rose-500 bg-rose-500/10 text-rose-200"
              : reconnecting
                ? "border-amber-400 bg-amber-500/10 text-amber-200"
                : negotiating
                  ? "border-sky-400 bg-sky-500/10 text-sky-200"
                  : "border-dashed border-slate-700 bg-slate-900 text-slate-500"
        }`}
      >
        {waiting ? (
          <UserRound className="h-14 w-14 opacity-40" strokeWidth={1.5} />
        ) : negotiating ? (
          <Loader2 className="h-12 w-12 animate-spin" strokeWidth={1.5} />
        ) : failed ? (
          <AlertTriangle className="h-12 w-12" strokeWidth={1.5} />
        ) : (
          <UserRound className="h-14 w-14" strokeWidth={1.5} />
        )}
      </div>
    </div>
  );
}

function ControlBar({
  muted,
  canMute,
  onToggleMute,
  onLeave,
}: {
  muted: boolean;
  canMute: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
}) {
  return (
    <footer className="border-t border-slate-900 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-center gap-5 px-6 py-5">
        <IconButton
          label={muted ? "Unmute microphone" : "Mute microphone"}
          onClick={onToggleMute}
          disabled={!canMute}
          variant={muted ? "danger" : "neutral"}
        >
          {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </IconButton>
        <IconButton
          label="Leave call"
          onClick={onLeave}
          variant="hangup"
        >
          <PhoneOff className="h-6 w-6" />
        </IconButton>
      </div>
    </footer>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  variant,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant: "neutral" | "danger" | "hangup";
  children: React.ReactNode;
}) {
  const styles =
    variant === "hangup"
      ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20"
      : variant === "danger"
        ? "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 ring-1 ring-inset ring-rose-500/30"
        : "bg-slate-800 text-slate-100 hover:bg-slate-700 ring-1 ring-inset ring-slate-700";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-14 w-14 items-center justify-center rounded-full transition ${styles} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function MicDenied({
  onRetry,
  onCancel,
}: {
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="min-h-full flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30">
          <MicOff className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Microphone access needed</h2>
        <p className="mt-2 text-sm text-slate-400">
          DuoCall needs your microphone to place calls. Grant permission in your
          browser's site settings, then try again.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Back to home
          </button>
          <button
            onClick={onRetry}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

function signalingStyles(state: ConnectionState) {
  switch (state) {
    case "connected":
      return {
        chip: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
        dot: "bg-emerald-400",
        label: "Connected",
      };
    case "connecting":
      return {
        chip: "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/30",
        dot: "bg-sky-400 animate-pulse",
        label: "Connecting…",
      };
    case "reconnecting":
      return {
        chip: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/30",
        dot: "bg-amber-400 animate-pulse",
        label: "Reconnecting…",
      };
    case "closed":
      return {
        chip: "bg-slate-800 text-slate-400 ring-1 ring-inset ring-slate-700",
        dot: "bg-slate-500",
        label: "Disconnected",
      };
    default:
      return {
        chip: "bg-slate-800 text-slate-400 ring-1 ring-inset ring-slate-700",
        dot: "bg-slate-500",
        label: "Idle",
      };
  }
}

function stateLabel(state: CallState): string {
  switch (state) {
    case "acquiring-mic":
      return "Getting microphone…";
    case "waiting-for-peer":
      return "Waiting for a peer";
    case "negotiating":
      return "Connecting…";
    case "connected":
      return "In call";
    case "reconnecting":
      return "Reconnecting…";
    case "failed":
      return "Couldn't connect";
    case "closed":
      return "Call ended";
    default:
      return "Preparing…";
  }
}

function stateHint(state: CallState): string {
  switch (state) {
    case "waiting-for-peer":
      return "Share the room link below to invite someone.";
    case "connected":
      return "Audio is flowing peer-to-peer.";
    case "negotiating":
      return "Establishing the peer-to-peer connection.";
    case "reconnecting":
      return "Trying to restore the connection.";
    case "failed":
      return "This can happen on restrictive networks (e.g. corporate firewalls).";
    default:
      return " ";
  }
}
