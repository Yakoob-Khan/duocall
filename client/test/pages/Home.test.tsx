import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Home } from "../../src/pages/Home";
import * as api from "../../src/lib/api";

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<div data-testid="room-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Home page", () => {
  it("renders the title and Create button", () => {
    renderAt("/");
    expect(
      screen.getByRole("heading", { name: /duocall/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create a room/i }),
    ).toBeInTheDocument();
  });

  it("creates a room and navigates on success", async () => {
    vi.spyOn(api, "createRoom").mockResolvedValue({ roomId: "abc123" });
    renderAt("/");
    await userEvent.click(
      screen.getByRole("button", { name: /create a room/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("room-page")).toBeInTheDocument();
    });
  });

  it("shows an error message when createRoom rejects", async () => {
    vi.spyOn(api, "createRoom").mockRejectedValue(new Error("network down"));
    renderAt("/");
    await userEvent.click(
      screen.getByRole("button", { name: /create a room/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/network down/i)).toBeInTheDocument();
    });
  });

  it("shows a banner when arriving with ?error=room-full", () => {
    renderAt("/?error=room-full");
    expect(screen.getByText(/that room is full/i)).toBeInTheDocument();
  });

  it("shows a banner when arriving with ?error=invalid-room", () => {
    renderAt("/?error=invalid-room");
    expect(
      screen.getByText(/that room doesn't exist or has expired/i),
    ).toBeInTheDocument();
  });

  it("shows a banner when arriving with ?error=session-expired", () => {
    renderAt("/?error=session-expired");
    expect(screen.getByText(/your session expired/i)).toBeInTheDocument();
  });

  it("does not show a banner for unknown error codes", () => {
    renderAt("/?error=whatever");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dismisses the banner when the close button is clicked", async () => {
    renderAt("/?error=room-full");
    const banner = screen.getByText(/that room is full/i);
    expect(banner).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/that room is full/i)).toBeNull();
  });
});
