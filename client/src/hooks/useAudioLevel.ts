import { useEffect, useState } from "react";

const SPEAKING_THRESHOLD = 20; // 0-255 scale from getByteFrequencyData

export function useAudioLevel(stream: MediaStream | null): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream) {
      setIsSpeaking(false);
      return;
    }

    const AudioCtx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const audioCtx = new AudioCtx();
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (const v of buffer) sum += v;
      const avg = sum / buffer.length;
      setIsSpeaking(avg > SPEAKING_THRESHOLD);
      rafId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
      void audioCtx.close();
    };
  }, [stream]);

  return isSpeaking;
}
