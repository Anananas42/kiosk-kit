import { describe, expect, it } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

describe("reports.consumption procedure", () => {
  it("aggregates consumption by item and buyer", async () => {
    const records = [
      {
        timestamp: "2024-01-01T10:00:00Z",
        buyer: 1,
        count: 2,
        category: "Drinks",
        item: "Coffee",
        itemId: "10",
        quantity: "1 cup",
        price: "50",
        taxRate: "21",
      },
      {
        timestamp: "2024-01-01T11:00:00Z",
        buyer: 2,
        count: 1,
        category: "Drinks",
        item: "Coffee",
        itemId: "10",
        quantity: "1 cup",
        price: "50",
        taxRate: "21",
      },
    ];
    const store = { getRecords: () => records } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["reports.consumption"]();

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].item).toBe("Coffee");
    expect(result.rows[0].byBuyer).toEqual({ "1": 2, "2": 1 });
  });

  it("returns empty rows for no records", async () => {
    const store = { getRecords: () => [] } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["reports.consumption"]();
    expect(result.rows).toEqual([]);
  });
});

describe("reports.consumptionV2 procedure", () => {
  it("returns summary and buyerTotals", async () => {
    const store = {
      getConsumptionSummary: () => [
        {
          itemKey: "10",
          item: "Coffee",
          itemId: "10",
          category: "Drinks",
          quantity: "1 cup",
          taxRate: "21",
          byBuyer: '{"1":{"count":2,"total":100},"2":{"count":1,"total":50}}',
          totalCount: 3,
          grandTotal: 150,
          unitPrice: 50,
        },
      ],
      getTotalsByBuyerAndTaxRate: () => [
        { buyer: 1, taxRate: "21", netCount: 2, netTotal: 100 },
        { buyer: 2, taxRate: "21", netCount: 1, netTotal: 50 },
      ],
    } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["reports.consumptionV2"]({ from: "2024-01-01" });

    expect(result.summary).toHaveLength(1);
    expect(result.summary[0].item).toBe("Coffee");
    expect(result.summary[0].byBuyer).toEqual({
      "1": { count: 2, total: 100 },
      "2": { count: 1, total: 50 },
    });
    expect(result.buyerTotals).toHaveLength(2);
  });
});

describe("reports.preorders procedure", () => {
  it("returns empty rows when no preorder records", async () => {
    const store = {
      getPreorderConfig: () => null,
      getRecords: () => [],
      getCatalog: () => [],
    } as unknown as Store;
    const caller = createCaller({ store });
    const result = await caller["reports.preorders"]();
    expect(result.rows).toEqual([]);
  });
});
