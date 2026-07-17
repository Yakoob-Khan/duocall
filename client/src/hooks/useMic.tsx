import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MIC_TIMEOUT_MS = 8_000;

export type MicErrorCode = "denied" | "blocked" | "timeout";

export type MicState =
  | { status: "idle" }
  | { status: "acquiring" }
  | { status: "ready"; stream: MediaStream }
  | { status: "error"; code: MicErrorCode; message: string };

interface MicContextValue {
  state: MicState;
  ensureMic: () => Promise<void>;
  retry: () => Promise<void>;
}

const MicContext = createContext<MicContextValue | null>(null);

/**
 * Query the current microphone permission state. Returns null if the
 * Permissions API is not available (older Safari). "denied" here means the
 * user explicitly clicked Block - the browser will refuse to show the popup
 * again on subsequent getUserMedia calls until the site permission is reset.
 */
async function queryMicPermission(): Promise<PermissionState | null> {
  if (typeof navigator === "undefined" || !navigator.permissions) return null;
  try {
    const result = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return result.state;
  } catch {
    return null;
  }
}

async function getUserMediaWithTimeout(): Promise<MediaStream> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("mic-timeout")),
          MIC_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function MicProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MicState>({ status: "idle" });
  const stateRef = useRef(state);
  stateRef.current = state;
  const acquisitionRef = useRef<Promise<void> | null>(null);

  const doAcquire = useCallback(async (): Promise<void> => {
    setState({ status: "acquiring" });
    try {
      const stream = await getUserMediaWithTimeout();
      // Start unmuted whenever we (re)acquire, in case tracks carried a
      // disabled state from a previous session.
      for (const track of stream.getAudioTracks()) track.enabled = true;
      setState({ status: "ready", stream });
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "mic-timeout";
      // Distinguish "explicitly blocked" from "prompt dismissed / not answered":
      // blocked -> Chrome will refuse to re-show the popup until the site
      //   permission is reset in browser settings.
      // denied  -> the popup will appear again on the next getUserMedia call,
      //   so a plain "Try Again" is enough to recover.
      const permState = isTimeout ? null : await queryMicPermission();
      const isBlocked = permState === "denied";
      setState({
        status: "error",
        code: isBlocked ? "blocked" : isTimeout ? "timeout" : "denied",
        message:
          err instanceof Error
            ? isTimeout
              ? "Microphone acquisition timed out."
              : err.message
            : "Unknown microphone error.",
      });
    }
  }, []);

  const ensureMic = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (current.status === "ready") return;
    if (acquisitionRef.current) return acquisitionRef.current;

    const p = doAcquire().finally(() => {
      acquisitionRef.current = null;
    });
    acquisitionRef.current = p;
    return p;
  }, [doAcquire]);

  const retry = useCallback(async (): Promise<void> => {
    // Clear error/idle state and try again.
    if (acquisitionRef.current) return acquisitionRef.current;
    const p = doAcquire().finally(() => {
      acquisitionRef.current = null;
    });
    acquisitionRef.current = p;
    return p;
  }, [doAcquire]);

  // Stop tracks only on app unmount (i.e. tab close / SPA teardown). We never
  // release between rooms - that's the whole point.
  useEffect(() => {
    return () => {
      if (stateRef.current.status === "ready") {
        for (const track of stateRef.current.stream.getTracks()) track.stop();
      }
    };
  }, []);

  return (
    <MicContext.Provider value={{ state, ensureMic, retry }}>
      {children}
    </MicContext.Provider>
  );
}

export function useMic(): MicContextValue {
  const ctx = useContext(MicContext);
  if (!ctx) throw new Error("useMic must be used within a MicProvider");
  return ctx;
}
