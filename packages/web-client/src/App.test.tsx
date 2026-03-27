import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

/** Wrap data in the tRPC batch response format used by httpBatchLink. */
function trpcBatchResponse(data: unknown) {
  return new Response(JSON.stringify([{ result: { type: "data", data } }]));
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("App", () => {
  it("renders sign-in when not authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(trpcBatchResponse({ user: null }));
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });

  it("renders device list when authenticated", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        trpcBatchResponse({
          user: { id: "1", name: "Test", email: "t@t.com", role: "customer" },
        }),
      )
      .mockResolvedValueOnce(trpcBatchResponse([]));
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByText("No devices registered.")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });
});
