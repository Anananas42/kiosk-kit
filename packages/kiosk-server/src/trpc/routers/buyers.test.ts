import { describe, expect, it } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

const mockBuyers = [
  { id: 1, label: "Room 101" },
  { id: 2, label: "Room 102" },
];

const mockStore = {
  getBuyers: () => mockBuyers,
} as unknown as Store;

describe("buyers.list procedure", () => {
  it("returns all buyers", async () => {
    const caller = createCaller({ store: mockStore });
    const result = await caller["buyers.list"]();
    expect(result).toEqual({ buyers: mockBuyers });
  });

  it("returns empty array when no buyers exist", async () => {
    const emptyStore = { getBuyers: () => [] } as unknown as Store;
    const caller = createCaller({ store: emptyStore });
    const result = await caller["buyers.list"]();
    expect(result).toEqual({ buyers: [] });
  });
});
