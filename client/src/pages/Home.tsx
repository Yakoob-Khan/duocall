import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PhoneCall, Lock, Loader2, X } from "lucide-react";
import { createRoom } from "../lib/api";

const ERROR_LABELS: Record<string, string> = {
  "room-full": "That room is full. Two participants are already connected.",
  "invalid-room": "That room doesn't exist or has expired.",
  "session-expired": "Your session expired. Please create a new room.",
  "peer-left": "The other participant left the call.",
};

export function Home() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const q = params.get("error");
    if (q && ERROR_LABELS[q]) {
      setBanner(ERROR_LABELS[q]);
      params.delete("error");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await createRoom();
      navigate(`/room/${roomId}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't reach the server. Is it running on port 8080?",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          {banner && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
            >
              <span className="flex-1">{banner}</span>
              <button
                onClick={() => setBanner(null)}
                aria-label="Dismiss"
                className="text-amber-300/70 hover:text-amber-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-500/30">
              <PhoneCall className="h-7 w-7" />
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight">
              DuoCall
            </h1>
            <p className="mt-3 text-slate-400">
              Simple 1:1 audio calls in the browser. No signup, no plugins.
            </p>

            <button
              onClick={handleCreate}
              disabled={busy}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-base font-medium text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating room…
                </>
              ) : (
                "Create a room"
              )}
            </button>

            {error && (
              <p role="alert" className="mt-4 text-sm text-rose-400">
                {error}
              </p>
            )}

            <p className="mt-6 text-xs text-slate-500">
              To join an existing room, paste its URL into your browser.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-900/80 bg-slate-950 px-6 py-4 text-center text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" />
          Peer-to-peer over WebRTC. Media is encrypted end-to-end (SRTP/DTLS).
        </span>
      </footer>
    </div>
  );
}
