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

  it("shows pulse ring elements only when connected", () => {
    const { container: connectedC } = render(
      <PeerCircle callState={CallState.Connected} />,
    );
    expect(
      connectedC.querySelectorAll("span.animate-pulse-slow").length,
    ).toBeGreaterThan(0);

    const { container: waitingC } = render(
      <PeerCircle callState={CallState.WaitingForPeer} />,
    );
    expect(waitingC.querySelectorAll("span.animate-pulse-slow").length).toBe(0);
  });

  it("renders spinning icon for negotiating/acquiring-mic", () => {
    for (const state of [CallState.Negotiating, CallState.AcquiringMic]) {
      const { container } = render(<PeerCircle callState={state} />);
      expect(container.querySelectorAll(".animate-spin").length).toBe(1);
    }
  });
});
