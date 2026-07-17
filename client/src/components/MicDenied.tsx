import { MicOff } from "lucide-react";

export interface MicDeniedProps {
  onRetry: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

const DEFAULT_TITLE = "Microphone access needed";
const DEFAULT_DESCRIPTION =
  "DuoCall needs your microphone to place calls. Grant permission in your browser's site settings, then try again.";

export function MicDenied({
  onRetry,
  onCancel,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
}: MicDeniedProps) {
  return (
    <div className="min-h-full flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30">
          <MicOff className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
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
