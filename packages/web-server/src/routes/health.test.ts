import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const mockDb = {} as Parameters<typeof createApp>[0];

describe("health route", () => {
  it("returns ok", async () => {
    const app = createApp(mockDb);
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
