import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "../../src/components/Header";
import { ConnectionState } from "../../src/lib/signaling";

describe("Header", () => {
  it("renders the app name", () => {
    render(<Header connState={ConnectionState.Idle} />);
    expect(screen.getByText("DuoCall")).toBeInTheDocument();
  });

  it.each([
    [ConnectionState.Connected, "Connected"],
    [ConnectionState.Connecting, "Connecting…"],
    [ConnectionState.Reconnecting, "Reconnecting…"],
    [ConnectionState.Closed, "Disconnected"],
    [ConnectionState.Idle, "Idle"],
  ])("shows label %s for connection state", (state, expectedLabel) => {
    render(<Header connState={state} />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});
