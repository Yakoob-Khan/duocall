import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PeerCircle } from "../../src/components/PeerCircle";
import { CallState } from "../../src/lib/rtc";

describe("PeerCircle", () => {
  it("uses emerald border classes when connected", () => {
    const { container } = render(<PeerCircle callState={CallState.Connected} />);
    const inner = container.querySelector("div.rounded-full.border-2");
    expect(inner?.className).toMatch(/border-emerald-400/);
  });

  it("uses rose classes when the call failed", () => {
    const { container } = render(<PeerCircle callState={CallState.Failed} />);
    const inner = container.querySelector("div.rounded-full.border-2");
    expect(inner?.className).toMatch(/border-rose-500/);
  });

  it("uses amber classes when reconnecting", () => {
    const { container } = render(
      <PeerCircle callState={CallState.Reconnecting} />,
    );
    const inner = container.querySelector("div.rounded-full.border-2");
    expect(inner?.className).toMatch(/border-amber-400/);
  });

  it("uses sky classes when negotiating", () => {
    const { container } = render(
      <PeerCircle callState={CallState.Negotiating} />,
    );
    const inner = container.querySelector("div.rounded-full.border-2");
    expect(inner?.className).toMatch(/border-sky-400/);
  });

  it("uses dashed slate border for waiting/idle states", () => {
    for (const state of [
      CallState.WaitingForPeer,
      CallState.Idle,
      CallState.Closed,
    ]) {
      const { container } = render(<PeerCircle callState={state} />);
      const inner = container.querySelector("div.rounded-full.border-2");
      expect(inner?.className).toMatch(/border-dashed/);
    }
  });

  it("shows a static emerald ring when connected but not speaking", () => {
    const { container } = render(
      <PeerCircle callState={CallState.Connected} />,
    );
    expect(container.querySelectorAll(".animate-ping").length).toBe(0);
    expect(container.querySelector(".bg-emerald-500\\/10")).not.toBeNull();
  });

  it("shows an animated pulse ring when connected AND speaking", () => {
    const { container } = render(
      <PeerCircle callState={CallState.Connected} isSpeaking={true} />,
    );
    expect(container.querySelectorAll(".animate-ping").length).toBeGreaterThan(
      0,
    );
  });

  it("shows no pulse rings when not connected, even if isSpeaking is true", () => {
    for (const state of [
      CallState.WaitingForPeer,
      CallState.Idle,
      CallState.Negotiating,
      CallState.Failed,
    ]) {
      const { container } = render(
        <PeerCircle callState={state} isSpeaking={true} />,
      );
      expect(container.querySelectorAll(".animate-ping").length).toBe(0);
    }
  });

  it("renders spinning icon for negotiating/acquiring-mic", () => {
    for (const state of [CallState.Negotiating, CallState.AcquiringMic]) {
      const { container } = render(<PeerCircle callState={state} />);
      expect(container.querySelectorAll(".animate-spin").length).toBe(1);
    }
  });
});
