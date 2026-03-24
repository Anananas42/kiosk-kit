import {
  AdminBuyerCreateSchema,
  AdminBuyerDeleteSchema,
  AdminBuyerUpdateSchema,
  AdminCategoryCreateSchema,
  AdminCategoryDeleteSchema,
  AdminCategoryUpdateSchema,
  AdminItemCreateSchema,
  AdminItemDeleteSchema,
  AdminItemUpdateSchema,
  DEFAULT_KIOSK_SETTINGS,
  KioskSettingsSchema,
  KioskSettingsUpdateSchema,
  PreorderConfigUpdateSchema,
} from "@kioskkit/shared";
import { z } from "zod";
import { baseProcedure, router } from "../trpc.js";

const OkSchema = z.object({ ok: z.boolean() });
const OkWithIdSchema = z.object({ ok: z.boolean(), id: z.number().int() });

export const adminRouter = router({
  // ── Buyers ──────────────────────────────────────────────────────────
  "admin.buyers.create": baseProcedure
    .input(AdminBuyerCreateSchema)
    .output(OkSchema)
    .mutation(({ ctx, input }) => {
      try {
        ctx.store.createBuyer(input.id, input.label);
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint/i.test(err.message)) {
          throw new Error("Buyer already exists");
        }
        throw err;
      }
      return { ok: true };
    }),

  "admin.buyers.update": baseProcedure
    .input(AdminBuyerUpdateSchema)
    .output(OkSchema)
    .mutation(({ ctx, input }) => {
      ctx.store.updateBuyer(input.id, input.label);
      return { ok: true };
    }),

  "admin.buyers.delete": baseProcedure
    .input(AdminBuyerDeleteSchema)
    .output(OkSchema)
    .mutation(({ ctx, input }) => {
      ctx.store.deleteBuyer(input.id);
      return { ok: true };
    }),

  // ── Catalog categories ──────────────────────────────────────────────
  "admin.catalog.createCategory": baseProcedure
    .input(AdminCategoryCreateSchema)
    .output(OkWithIdSchema)
    .mutation(({ ctx, input }) => {
      const id = ctx.store.createCategory(input.name, input.preorder, input.sortOrder);
      return { ok: true, id };
    }),

  "admin.catalog.updateCategory": baseProcedure
    .input(AdminCategoryUpdateSchema)
    .output(OkSchema)
    .mutation(({ ctx, input }) => {
      ctx.store.updateCategory(input.id, input.name, input.preorder, input.sortOrder);
      return { ok: true };
    }),

  "admin.catalog.deleteCategory": baseProcedure
    .input(AdminCategoryDeleteSchema)
    .output(OkSchema)
    .mutation(({ ctx, input }) => {
      ctx.store.deleteCategory(input.id);
      return { ok: true };
    }),

  // ── Catalog items ───────────────────────────────────────────────────
  "admin.catalog.createItem": baseProcedure
    .input(AdminItemCreateSchema)
    .output(OkWithIdSchema)
    .mutation(({ ctx, input }) => {
      const id = ctx.store.createItem(
        input.categoryId,
        input.name,
        input.quantity,
        input.price,
        input.dphRate,
        input.sortOrder,
      );
      return { ok: true, id };
    }),

  "admin.catalog.updateItem": baseProcedure
    .input(AdminItemUpdateSchema)
    .output(OkSchema)
    .mutation(({ ctx, input }) => {
      ctx.store.updateItem(
        input.id,
        input.name,
        input.quantity,
        input.price,
        input.dphRate,
        input.sortOrder,
      );
      return { ok: true };
    }),

  "admin.catalog.deleteItem": baseProcedure
    .input(AdminItemDeleteSchema)
    .output(OkSchema)
    .mutation(({ ctx, input }) => {
      ctx.store.deleteItem(input.id);
      return { ok: true };
    }),

  // ── Settings ────────────────────────────────────────────────────────
  "admin.settings.get": baseProcedure.output(KioskSettingsSchema).query(({ ctx }) => {
    return ctx.store.getSettings() ?? DEFAULT_KIOSK_SETTINGS;
  }),

  "admin.settings.update": baseProcedure
    .input(KioskSettingsUpdateSchema)
    .output(OkSchema)
    .mutation(({ ctx, input }) => {
      for (const [key, value] of Object.entries(input)) {
        ctx.store.putSetting(key, String(value));
      }
      return { ok: true };
    }),

  // ── Preorder config ─────────────────────────────────────────────────
  "admin.preorderConfig.update": baseProcedure
    .input(PreorderConfigUpdateSchema)
    .output(OkSchema)
    .mutation(({ ctx, input }) => {
      ctx.store.putPreorderConfig(input.weekday, input.ordering, input.delivery);
      return { ok: true };
    }),
});
