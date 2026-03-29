import { ReleaseTypeSchema } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { releases } from "../../db/schema.js";
import { adminProcedure, router } from "../trpc.js";

export const adminReleasesRouter = router({
  "releases.publish": adminProcedure
    .input(
      z
        .object({
          version: z.string().min(1),
          releaseType: ReleaseTypeSchema,
          otaAssetUrl: z.string().url().optional(),
          otaSha256: z.string().min(1).optional(),
          appAssetUrl: z.string().url().optional(),
          appSha256: z.string().min(1).optional(),
          releaseNotes: z.string().optional(),
        })
        .refine((v) => v.otaAssetUrl || v.appAssetUrl, {
          message: "At least one asset (OTA or app) is required",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate version + type combination
      const [existing] = await ctx.db
        .select({ id: releases.id })
        .from(releases)
        .where(
          and(eq(releases.version, input.version), eq(releases.releaseType, input.releaseType)),
        );

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Version ${input.version} (${input.releaseType}) already exists`,
        });
      }

      const [release] = await ctx.db
        .insert(releases)
        .values({
          version: input.version,
          releaseType: input.releaseType,
          otaAssetUrl: input.otaAssetUrl ?? null,
          otaSha256: input.otaSha256 ?? null,
          appAssetUrl: input.appAssetUrl ?? null,
          appSha256: input.appSha256 ?? null,
          releaseNotes: input.releaseNotes ?? null,
          publishedBy: ctx.user.id,
        })
        .returning();

      return {
        id: release!.id,
        version: release!.version,
        releaseType: release!.releaseType,
        otaAssetUrl: release!.otaAssetUrl,
        otaSha256: release!.otaSha256,
        appAssetUrl: release!.appAssetUrl,
        appSha256: release!.appSha256,
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
        otaAssetUrl: z.string().url().optional(),
        otaSha256: z.string().min(1).optional(),
        appAssetUrl: z.string().url().optional(),
        appSha256: z.string().min(1).optional(),
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
      if (fields.otaAssetUrl !== undefined) updates.otaAssetUrl = fields.otaAssetUrl;
      if (fields.otaSha256 !== undefined) updates.otaSha256 = fields.otaSha256;
      if (fields.appAssetUrl !== undefined) updates.appAssetUrl = fields.appAssetUrl;
      if (fields.appSha256 !== undefined) updates.appSha256 = fields.appSha256;

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
        releaseType: release!.releaseType,
        otaAssetUrl: release!.otaAssetUrl,
        otaSha256: release!.otaSha256,
        appAssetUrl: release!.appAssetUrl,
        appSha256: release!.appSha256,
        releaseNotes: release!.releaseNotes,
        isPublished: release!.isPublished,
        isArchived: release!.isArchived,
        publishedBy: release!.publishedBy,
        publishedAt: release!.publishedAt.toISOString(),
      };
    }),

  "releases.list": adminProcedure
    .input(z.object({ type: ReleaseTypeSchema }).optional())
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
        otaAssetUrl: r.otaAssetUrl,
        otaSha256: r.otaSha256,
        appAssetUrl: r.appAssetUrl,
        appSha256: r.appSha256,
        releaseNotes: r.releaseNotes,
        isPublished: r.isPublished,
        isArchived: r.isArchived,
        publishedBy: r.publishedBy,
        publishedAt: r.publishedAt.toISOString(),
      }));
    }),
});
