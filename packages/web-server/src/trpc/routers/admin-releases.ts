import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { releases } from "../../db/schema.js";
import { adminProcedure, router } from "../trpc.js";

export const adminReleasesRouter = router({
  "releases.publish": adminProcedure
    .input(
      z.object({
        version: z.string().min(1),
        releaseType: z.enum(["ota", "app"]),
        githubAssetUrl: z.string().url(),
        sha256: z.string().min(1),
        releaseNotes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate version
      const [existing] = await ctx.db
        .select({ id: releases.id })
        .from(releases)
        .where(eq(releases.version, input.version));

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Version ${input.version} already exists`,
        });
      }

      const [release] = await ctx.db
        .insert(releases)
        .values({
          version: input.version,
          releaseType: input.releaseType,
          githubAssetUrl: input.githubAssetUrl,
          sha256: input.sha256,
          releaseNotes: input.releaseNotes ?? null,
          publishedBy: ctx.user.id,
        })
        .returning();

      return {
        id: release!.id,
        version: release!.version,
        releaseType: release!.releaseType,
        sha256: release!.sha256,
        releaseNotes: release!.releaseNotes,
        isPublished: release!.isPublished,
        isArchived: release!.isArchived,
        publishedAt: release!.publishedAt.toISOString(),
      };
    }),

  "releases.update": adminProcedure
    .input(
      z.object({
        id: z.uuid(),
        releaseNotes: z.string().optional(),
        isPublished: z.boolean().optional(),
        isArchived: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      const [existing] = await ctx.db
        .select({ id: releases.id })
        .from(releases)
        .where(eq(releases.id, id));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Release not found" });
      }

      const updates: Record<string, unknown> = {};
      if (fields.releaseNotes !== undefined) updates.releaseNotes = fields.releaseNotes;
      if (fields.isPublished !== undefined) updates.isPublished = fields.isPublished;
      if (fields.isArchived !== undefined) updates.isArchived = fields.isArchived;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No fields to update" });
      }

      const [release] = await ctx.db
        .update(releases)
        .set(updates)
        .where(eq(releases.id, id))
        .returning();

      return {
        id: release!.id,
        version: release!.version,
        githubAssetUrl: release!.githubAssetUrl,
        sha256: release!.sha256,
        releaseNotes: release!.releaseNotes,
        isPublished: release!.isPublished,
        isArchived: release!.isArchived,
        publishedBy: release!.publishedBy,
        publishedAt: release!.publishedAt.toISOString(),
      };
    }),

  "releases.list": adminProcedure
    .input(z.object({ type: z.enum(["ota", "app"]) }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input?.type) {
        conditions.push(eq(releases.releaseType, input.type));
      }

      const query = conditions.length
        ? ctx.db
            .select()
            .from(releases)
            .where(and(...conditions))
        : ctx.db.select().from(releases);

      const rows = await query.orderBy(desc(releases.publishedAt));

      return rows.map((r) => ({
        id: r.id,
        version: r.version,
        releaseType: r.releaseType,
        githubAssetUrl: r.githubAssetUrl,
        sha256: r.sha256,
        releaseNotes: r.releaseNotes,
        isPublished: r.isPublished,
        isArchived: r.isArchived,
        publishedBy: r.publishedBy,
        publishedAt: r.publishedAt.toISOString(),
      }));
    }),
});
