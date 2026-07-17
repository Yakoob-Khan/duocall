import { useEffect, useRef } from "react";

interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  0: SpeechAlternative;
  isFinal: boolean;
  length: number;
}
interface SpeechResultList {
  length: number;
  item(i: number): SpeechResult;
  [i: number]: SpeechResult;
}
interface SpeechRecognitionEventLike {
  results: SpeechResultList;
  resultIndex: number;
}
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognitionOpts {
  enabled: boolean;
  lang?: string;
  onTranscript: (text: string, final: boolean) => void;
}

export function useSpeechRecognition({
  enabled,
  lang = "en-US",
  onTranscript,
}: UseSpeechRecognitionOpts): { supported: boolean } {
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  useEffect(() => {
    if (!enabled) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    let shouldRestart = true;

    rec.onresult = (event) => {
      // Only emit the CURRENT phrase - not the accumulated history. Each new
      // utterance from SR gets its own results[] entry; taking just the latest
      // one gives natural "overwrite on new phrase" behavior on the receiver.
      const last = event.results[event.results.length - 1];
      if (!last) return;
      const text = last[0].transcript.trim();
      if (!text) return;
      callbackRef.current(text, last.isFinal);
    };
    rec.onerror = () => {
      // Common non-fatal errors: "no-speech", "audio-capture", "network".
      // Restart in onend below.
    };
    rec.onend = () => {
      if (shouldRestart) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };

    try {
      rec.start();
    } catch {
      /* already started */
    }

    return () => {
      shouldRestart = false;
      // abort() releases the mic hardware immediately without waiting for the
      // graceful stop -> onend cycle. Critical for making the next
      // getUserMedia call in a fresh room succeed quickly.
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    };
  }, [enabled, lang]);

  return { supported: getSpeechRecognitionCtor() !== null };
}
