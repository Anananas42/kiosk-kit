import { ReleaseTypeSchema } from "@kioskkit/shared";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { releases } from "../../db/schema.js";
import { authedProcedure, router } from "../trpc.js";

export const releasesRouter = router({
  "releases.latest": authedProcedure
    .input(z.object({ type: ReleaseTypeSchema }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(releases.isPublished, true), eq(releases.isArchived, false)];
      if (input?.type) {
        conditions.push(eq(releases.releaseType, input.type));
      }

      const [release] = await ctx.db
        .select()
        .from(releases)
        .where(and(...conditions))
        .orderBy(desc(releases.publishedAt))
        .limit(1);

      if (!release) return null;

      return {
        version: release.version,
        releaseType: release.releaseType,
        otaAssetUrl: release.otaAssetUrl,
        otaSha256: release.otaSha256,
        appAssetUrl: release.appAssetUrl,
        appSha256: release.appSha256,
        releaseNotes: release.releaseNotes,
        publishedAt: release.publishedAt.toISOString(),
      };
    }),
});
