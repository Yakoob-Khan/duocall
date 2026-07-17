import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlBar } from "../../src/components/ControlBar";

describe("ControlBar", () => {
  it("renders both mute and leave buttons", () => {
    render(
      <ControlBar
        muted={false}
        canMute={true}
        onToggleMute={() => {}}
        onLeave={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /mute microphone/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /leave call/i }),
    ).toBeInTheDocument();
  });

  it("shows 'Unmute microphone' label when muted", () => {
    render(
      <ControlBar
        muted={true}
        canMute={true}
        onToggleMute={() => {}}
        onLeave={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /unmute microphone/i }),
    ).toBeInTheDocument();
  });

  it("disables the mute button when canMute is false", () => {
    render(
      <ControlBar
        muted={false}
        canMute={false}
        onToggleMute={() => {}}
        onLeave={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /mute microphone/i }),
    ).toBeDisabled();
  });

  it("wires onToggleMute and onLeave to the correct buttons", async () => {
    const onToggleMute = vi.fn();
    const onLeave = vi.fn();
    render(
      <ControlBar
        muted={false}
        canMute={true}
        onToggleMute={onToggleMute}
        onLeave={onLeave}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /mute microphone/i }),
    );
    expect(onToggleMute).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /leave call/i }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
