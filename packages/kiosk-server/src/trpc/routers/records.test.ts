import { describe, expect, it, vi } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

const mockRecords = [
  {
    timestamp: "2024-01-01T00:00:00.000Z",
    buyer: 1,
    count: 2,
    category: "Drinks",
    item: "Coffee",
    itemId: "10",
    quantity: "1 cup",
    price: "50",
  },
];

describe("records.submit procedure", () => {
  it("inserts a valid record", async () => {
    const insertRecord = vi.fn();
    const store = {
      insertRecord,
      getItemBalance: () => 0,
    } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["records.submit"]({
      buyer: 1,
      count: 1,
      category: "Drinks",
      item: "Coffee",
      itemId: "10",
      quantity: "1 cup",
      price: "50",
    });

    expect(result).toEqual({ ok: true });
    expect(insertRecord).toHaveBeenCalledOnce();
  });

  it("rejects insufficient balance for negative count", async () => {
    const store = {
      getItemBalance: () => 0,
      insertRecord: vi.fn(),
    } as unknown as Store;
    const caller = createCaller({ store });

    await expect(
      caller["records.submit"]({
        buyer: 1,
        count: -1,
        category: "Drinks",
        item: "Coffee",
      }),
    ).rejects.toThrow("insufficient_balance");
  });

  it("rejects zero count", async () => {
    const store = {} as unknown as Store;
    const caller = createCaller({ store });

    await expect(
      caller["records.submit"]({
        buyer: 1,
        count: 0,
        category: "Drinks",
        item: "Coffee",
      }),
    ).rejects.toThrow();
  });
});

describe("records.list procedure", () => {
  it("returns all records", async () => {
    const store = { getRecords: () => mockRecords } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["records.list"]();
    expect(result).toEqual({ records: mockRecords });
  });
});

describe("records.itemCount procedure", () => {
  it("returns item balance", async () => {
    const store = { getItemBalance: () => 5 } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["records.itemCount"]({
      buyer: 1,
      item: "Coffee",
      itemId: "10",
    });
    expect(result).toEqual({ count: 5 });
  });
});
