import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  it("renders sign-in when not authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: null })),
    );
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    });
    vi.restoreAllMocks();
  });
});
