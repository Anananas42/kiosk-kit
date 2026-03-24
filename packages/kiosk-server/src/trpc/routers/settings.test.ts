import { DEFAULT_KIOSK_SETTINGS, DEFAULT_PREORDER_CONFIG } from "@kioskkit/shared";
import { describe, expect, it } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

describe("settings.get procedure", () => {
  it("returns stored settings", async () => {
    const settings = {
      idleDimMs: 10000,
      inactivityTimeoutMs: 30000,
      maintenance: false,
      locale: "en",
      currency: "EUR",
      buyerNoun: "room",
    };
    const store = { getSettings: () => settings } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["settings.get"]();
    expect(result).toEqual(settings);
  });

  it("returns defaults when no settings stored", async () => {
    const store = { getSettings: () => null } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["settings.get"]();
    expect(result).toEqual(DEFAULT_KIOSK_SETTINGS);
  });
});

describe("preorderConfig.get procedure", () => {
  it("returns stored config", async () => {
    const config = {
      orderingDays: [true, false, true, false, true, false, true],
      deliveryDays: [false, true, false, true, false, true, false],
    };
    const store = { getPreorderConfig: () => config } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["preorderConfig.get"]();
    expect(result).toEqual(config);
  });

  it("returns defaults when no config stored", async () => {
    const store = { getPreorderConfig: () => null } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["preorderConfig.get"]();
    expect(result).toEqual(DEFAULT_PREORDER_CONFIG);
  });
});
