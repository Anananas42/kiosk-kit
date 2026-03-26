import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { releases } from "../../db/schema.js";
import { adminProcedure, authedProcedure, router } from "../trpc.js";

export const releasesRouter = router({
  "releases.publish": adminProcedure
    .input(
      z.object({
        version: z.string().min(1),
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
          githubAssetUrl: input.githubAssetUrl,
          sha256: input.sha256,
          releaseNotes: input.releaseNotes ?? null,
          publishedBy: ctx.user.id,
        })
        .returning();

      return {
        id: release!.id,
        version: release!.version,
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
        id: z.string().uuid(),
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

  "releases.latest": authedProcedure.query(async ({ ctx }) => {
    const [release] = await ctx.db
      .select()
      .from(releases)
      .where(and(eq(releases.isPublished, true), eq(releases.isArchived, false)))
      .orderBy(desc(releases.publishedAt))
      .limit(1);

    if (!release) return null;

    return {
      version: release.version,
      sha256: release.sha256,
      releaseNotes: release.releaseNotes,
      publishedAt: release.publishedAt.toISOString(),
    };
  }),

  "releases.list": adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(releases).orderBy(desc(releases.publishedAt));

    return rows.map((r) => ({
      id: r.id,
      version: r.version,
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
