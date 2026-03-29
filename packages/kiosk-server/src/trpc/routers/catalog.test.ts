import { describe, expect, it } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

const mockCatalog = [
  {
    id: "1",
    name: "Drinks",
    preorder: false,
    sortOrder: 0,
    items: [
      { id: "10", name: "Coffee", quantity: "1 cup", price: "50", dphRate: "21", sortOrder: 0 },
      { id: "11", name: "Tea", quantity: "1 cup", price: "30", dphRate: "21", sortOrder: 1 },
    ],
  },
  {
    id: "2",
    name: "Snacks",
    preorder: true,
    sortOrder: 1,
    items: [
      { id: "20", name: "Cookie", quantity: "1 pc", price: "25", dphRate: "15", sortOrder: 0 },
    ],
  },
];

const mockStore = {
  getCatalog: () => mockCatalog,
} as unknown as Store;

describe("catalog.list procedure", () => {
  it("returns the full catalog", async () => {
    const caller = createCaller({ store: mockStore });
    const result = await caller["catalog.list"]();
    expect(result).toEqual(mockCatalog);
  });

  it("returns empty array when catalog is empty", async () => {
    const emptyStore = { getCatalog: () => [] } as unknown as Store;
    const caller = createCaller({ store: emptyStore });
    const result = await caller["catalog.list"]();
    expect(result).toEqual([]);
  });

  it("preserves category and item structure", async () => {
    const caller = createCaller({ store: mockStore });
    const result = await caller["catalog.list"]();

    expect(result).toHaveLength(2);
    expect(result[0].items).toHaveLength(2);
    expect(result[1].items).toHaveLength(1);
    expect(result[0].preorder).toBe(false);
    expect(result[1].preorder).toBe(true);
  });
});
