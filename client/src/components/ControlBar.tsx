import { Mic, MicOff, PhoneOff } from "lucide-react";
import { IconButton } from "./IconButton";

export interface ControlBarProps {
  muted: boolean;
  canMute: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
}

export function ControlBar({
  muted,
  canMute,
  onToggleMute,
  onLeave,
}: ControlBarProps) {
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
        <IconButton label="Leave call" onClick={onLeave} variant="hangup">
          <PhoneOff className="h-6 w-6" />
        </IconButton>
      </div>
    </footer>
  );
}
