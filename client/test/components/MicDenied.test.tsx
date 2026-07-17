import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MicDenied } from "../../src/components/MicDenied";

describe("MicDenied", () => {
  it("renders the heading and explanatory text", () => {
    render(<MicDenied onRetry={() => {}} onCancel={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /microphone access needed/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/grant permission/i)).toBeInTheDocument();
  });

  it("fires onRetry when the retry button is clicked", async () => {
    const onRetry = vi.fn();
    render(<MicDenied onRetry={onRetry} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when 'Back to home' is clicked", async () => {
    const onCancel = vi.fn();
    render(<MicDenied onRetry={() => {}} onCancel={onCancel} />);
    await userEvent.click(
      screen.getByRole("button", { name: /back to home/i }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
