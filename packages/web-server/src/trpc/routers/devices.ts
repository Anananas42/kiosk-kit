import { DeviceCreateInputSchema, DeviceSchema, DeviceUpdateInputSchema } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { devices } from "../../db/schema.js";
import { adminProcedure, authedProcedure, router } from "../trpc.js";

export const devicesRouter = router({
  "devices.get": authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(DeviceSchema)
    .query(async ({ ctx, input }) => {
      const conditions =
        ctx.user.role === "admin"
          ? eq(devices.id, input.id)
          : and(eq(devices.id, input.id), eq(devices.userId, ctx.user.id));

      const [device] = await ctx.db.select().from(devices).where(conditions);

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return {
        id: device.id,
        userId: device.userId,
        name: device.name,
        tailscaleIp: ctx.user.role === "admin" ? device.tailscaleIp : undefined,
        createdAt: device.createdAt.toISOString(),
      };
    }),

  "devices.list": authedProcedure.output(z.array(DeviceSchema)).query(async ({ ctx }) => {
    const query = ctx.db.select().from(devices);
    const result =
      ctx.user.role === "admin"
        ? await query
        : await query.where(eq(devices.userId, ctx.user.id));

    return result.map((d) => ({
      id: d.id,
      userId: d.userId,
      name: d.name,
      tailscaleIp: ctx.user.role === "admin" ? d.tailscaleIp : undefined,
      createdAt: d.createdAt.toISOString(),
    }));
  }),

  "devices.create": adminProcedure
    .input(DeviceCreateInputSchema)
    .output(DeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const [device] = await ctx.db
        .insert(devices)
        .values({
          userId: input.userId,
          name: input.name,
          tailscaleIp: input.tailscaleIp,
        })
        .returning();

      return {
        id: device.id,
        userId: device.userId,
        name: device.name,
        tailscaleIp: device.tailscaleIp,
        createdAt: device.createdAt.toISOString(),
      };
    }),

  "devices.update": adminProcedure
    .input(DeviceUpdateInputSchema)
    .output(DeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const updates: Record<string, string> = {};
      if (fields.name !== undefined) updates.name = fields.name;
      if (fields.tailscaleIp !== undefined) updates.tailscaleIp = fields.tailscaleIp;
      if (fields.userId !== undefined) updates.userId = fields.userId;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      }

      const [device] = await ctx.db
        .update(devices)
        .set(updates)
        .where(eq(devices.id, id))
        .returning();

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return {
        id: device.id,
        userId: device.userId,
        name: device.name,
        tailscaleIp: device.tailscaleIp,
        createdAt: device.createdAt.toISOString(),
      };
    }),

  "devices.delete": adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(devices)
        .where(eq(devices.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      return { ok: true };
    }),
});
