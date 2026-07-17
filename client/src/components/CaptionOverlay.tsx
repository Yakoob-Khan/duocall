import { Captions as CaptionsIcon } from "lucide-react";

export interface CaptionOverlayProps {
  text: string | null;
  supported: boolean;
}

export function CaptionOverlay({ text, supported }: CaptionOverlayProps) {
  if (!supported) {
    return (
      <div className="mt-4 max-w-md rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2 text-center text-xs text-slate-500">
        Live captions require Chrome or Edge.
      </div>
    );
  }

  return (
    <div className="mt-4 flex min-h-[64px] w-full max-w-md items-start justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-center">
      <CaptionsIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
      {text ? (
        <p className="text-sm leading-snug text-slate-100">{text}</p>
      ) : (
        <p className="text-sm italic text-slate-500">
          Waiting for the other side to speak…
        </p>
      )}
    </div>
  );
}
