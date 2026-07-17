import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconButton } from "../../src/components/IconButton";

describe("IconButton", () => {
  it("renders with the given aria-label and children", () => {
    render(
      <IconButton label="Mute microphone" onClick={() => {}} variant="neutral">
        <span data-testid="child-icon">🎤</span>
      </IconButton>,
    );
    expect(
      screen.getByRole("button", { name: "Mute microphone" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("child-icon")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="press me" onClick={onClick} variant="neutral">
        icon
      </IconButton>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="press me" onClick={onClick} variant="neutral" disabled>
        icon
      </IconButton>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies hangup variant classes", () => {
    render(
      <IconButton label="leave" onClick={() => {}} variant="hangup">
        x
      </IconButton>,
    );
    expect(screen.getByRole("button").className).toMatch(/bg-rose-600/);
  });

  it("applies danger variant classes", () => {
    render(
      <IconButton label="muted" onClick={() => {}} variant="danger">
        x
      </IconButton>,
    );
    expect(screen.getByRole("button").className).toMatch(/bg-rose-500\/20/);
  });

  it("applies neutral variant classes by default styling", () => {
    render(
      <IconButton label="neutral" onClick={() => {}} variant="neutral">
        x
      </IconButton>,
    );
    expect(screen.getByRole("button").className).toMatch(/bg-slate-800/);
  });
});
