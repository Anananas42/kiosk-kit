import { DEFAULT_KIOSK_SETTINGS } from "@kioskkit/shared";
import { describe, expect, it, vi } from "vitest";
import type { Store } from "../../db/store.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

const createCaller = createCallerFactory(appRouter);

describe("admin.buyers procedures", () => {
  it("creates a buyer", async () => {
    const createBuyer = vi.fn();
    const store = { createBuyer } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["admin.buyers.create"]({ id: 1, label: "Room 101" });
    expect(result).toEqual({ ok: true });
    expect(createBuyer).toHaveBeenCalledWith(1, "Room 101");
  });

  it("throws on duplicate buyer", async () => {
    const store = {
      createBuyer: () => {
        throw new Error("UNIQUE constraint failed");
      },
    } as unknown as Store;
    const caller = createCaller({ store });

    await expect(caller["admin.buyers.create"]({ id: 1, label: "Room 101" })).rejects.toThrow(
      "Buyer already exists",
    );
  });

  it("updates a buyer", async () => {
    const updateBuyer = vi.fn();
    const store = { updateBuyer } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["admin.buyers.update"]({ id: 1, label: "Room 102" });
    expect(result).toEqual({ ok: true });
    expect(updateBuyer).toHaveBeenCalledWith(1, "Room 102");
  });

  it("deletes a buyer", async () => {
    const deleteBuyer = vi.fn();
    const store = { deleteBuyer } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["admin.buyers.delete"]({ id: 1 });
    expect(result).toEqual({ ok: true });
    expect(deleteBuyer).toHaveBeenCalledWith(1);
  });
});

describe("admin.catalog procedures", () => {
  it("creates a category", async () => {
    const store = { createCategory: () => 42 } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["admin.catalog.createCategory"]({ name: "Snacks" });
    expect(result).toEqual({ ok: true, id: 42 });
  });

  it("creates an item", async () => {
    const store = { createItem: () => 99 } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["admin.catalog.createItem"]({
      categoryId: 1,
      name: "Cookie",
    });
    expect(result).toEqual({ ok: true, id: 99 });
  });

  it("deletes a category", async () => {
    const deleteCategory = vi.fn();
    const store = { deleteCategory } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["admin.catalog.deleteCategory"]({ id: 1 });
    expect(result).toEqual({ ok: true });
    expect(deleteCategory).toHaveBeenCalledWith(1);
  });
});

describe("admin.settings procedures", () => {
  it("returns settings", async () => {
    const store = { getSettings: () => null } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["admin.settings.get"]();
    expect(result).toEqual(DEFAULT_KIOSK_SETTINGS);
  });

  it("updates settings", async () => {
    const putSetting = vi.fn();
    const store = { putSetting } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["admin.settings.update"]({ maintenance: true });
    expect(result).toEqual({ ok: true });
    expect(putSetting).toHaveBeenCalledWith("maintenance", "true");
  });
});

describe("admin.preorderConfig procedures", () => {
  it("updates preorder config", async () => {
    const putPreorderConfig = vi.fn();
    const store = { putPreorderConfig } as unknown as Store;
    const caller = createCaller({ store });

    const result = await caller["admin.preorderConfig.update"]({
      weekday: 1,
      ordering: true,
      delivery: false,
    });
    expect(result).toEqual({ ok: true });
    expect(putPreorderConfig).toHaveBeenCalledWith(1, true, false);
  });
});
