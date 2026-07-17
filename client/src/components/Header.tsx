import { ConnectionState } from "../lib/signaling";

export function Header({ connState }: { connState: ConnectionState }) {
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

function signalingStyles(state: ConnectionState) {
  switch (state) {
    case ConnectionState.Connected:
      return {
        chip: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
        dot: "bg-emerald-400",
        label: "Connected",
      };
    case ConnectionState.Connecting:
      return {
        chip: "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/30",
        dot: "bg-sky-400 animate-pulse",
        label: "Connecting…",
      };
    case ConnectionState.Reconnecting:
      return {
        chip: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/30",
        dot: "bg-amber-400 animate-pulse",
        label: "Reconnecting…",
      };
    case ConnectionState.Closed:
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
