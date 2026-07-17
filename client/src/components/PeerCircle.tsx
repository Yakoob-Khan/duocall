import type { ReactNode } from "react";
import { AlertTriangle, Loader2, UserRound } from "lucide-react";
import { CallState } from "../lib/rtc";

const CIRCLE_CLASSES: Record<CallState, string> = {
  [CallState.Connected]:
    "border-emerald-400 bg-emerald-500/10 text-emerald-200",
  [CallState.Failed]: "border-rose-500 bg-rose-500/10 text-rose-200",
  [CallState.Reconnecting]: "border-amber-400 bg-amber-500/10 text-amber-200",
  [CallState.Negotiating]: "border-sky-400 bg-sky-500/10 text-sky-200",
  [CallState.AcquiringMic]: "border-sky-400 bg-sky-500/10 text-sky-200",
  [CallState.WaitingForPeer]:
    "border-dashed border-slate-700 bg-slate-900 text-slate-500",
  [CallState.Idle]:
    "border-dashed border-slate-700 bg-slate-900 text-slate-500",
  [CallState.Closed]:
    "border-dashed border-slate-700 bg-slate-900 text-slate-500",
};

function renderIcon(callState: CallState): ReactNode {
  switch (callState) {
    case CallState.WaitingForPeer:
    case CallState.Idle:
      return <UserRound className="h-14 w-14 opacity-40" strokeWidth={1.5} />;
    case CallState.Negotiating:
    case CallState.AcquiringMic:
      return <Loader2 className="h-12 w-12 animate-spin" strokeWidth={1.5} />;
    case CallState.Failed:
      return <AlertTriangle className="h-12 w-12" strokeWidth={1.5} />;
    case CallState.Connected:
    case CallState.Reconnecting:
    case CallState.Closed:
    default:
      return <UserRound className="h-14 w-14" strokeWidth={1.5} />;
  }
}

export interface PeerCircleProps {
  callState: CallState;
  isSpeaking?: boolean;
}

export function PeerCircle({ callState, isSpeaking = false }: PeerCircleProps) {
  const isConnected = callState === CallState.Connected;
  const showSpeakingRing = isConnected && isSpeaking;
  const showStaticRing = isConnected && !isSpeaking;

  return (
    <div className="relative">
      {showSpeakingRing && (
        <>
          <span className="absolute inset-0 -m-8 animate-ping rounded-full bg-emerald-400/20" />
          <span className="absolute inset-0 -m-4 rounded-full bg-emerald-500/30 ring-2 ring-emerald-300/40" />
        </>
      )}
      {showStaticRing && (
        <span className="absolute inset-0 -m-2 rounded-full bg-emerald-500/10" />
      )}
      <div
        className={`relative flex h-40 w-40 items-center justify-center rounded-full border-2 transition-colors ${CIRCLE_CLASSES[callState]}`}
      >
        {renderIcon(callState)}
      </div>
    </div>
  );
}
