import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

/** Wrap data in the tRPC batch response format used by httpBatchLink. */
function trpcBatchResponse(data: unknown) {
  return new Response(JSON.stringify([{ result: { type: "data", data } }]));
}

describe("App", () => {
  it("renders sign-in when not authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(trpcBatchResponse({ user: null }));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });

  it("renders empty state when no devices", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        trpcBatchResponse({
          user: { id: "1", name: "Test", email: "t@t.com", role: "customer" },
        }),
      )
      .mockResolvedValueOnce(trpcBatchResponse([]));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("No devices yet")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });

  it("renders device list when authenticated", async () => {
    const devices = [
      {
        id: "00000000-0000-0000-0000-000000000001",
        tailscaleNodeId: "node1",
        userId: "1",
        name: "Lobby Kiosk",
        online: true,
        lastSeen: new Date().toISOString(),
        hostname: "lobby",
        createdAt: new Date().toISOString(),
      },
    ];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        trpcBatchResponse({
          user: { id: "1", name: "Test", email: "t@t.com", role: "customer" },
        }),
      )
      .mockResolvedValueOnce(trpcBatchResponse(devices))
      .mockResolvedValueOnce(new Response(JSON.stringify({ online: true })));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Lobby Kiosk")).toBeInTheDocument();
    });
    fetchSpy.mockRestore();
  });
});
