import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { releases } from "../../db/schema.js";
import { authedProcedure, router } from "../trpc.js";

export const releasesRouter = router({
  "releases.latest": authedProcedure
    .input(z.object({ type: z.enum(["ota", "app"]) }).optional())
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
        sha256: release.sha256,
        releaseNotes: release.releaseNotes,
        publishedAt: release.publishedAt.toISOString(),
      };
    }),
});
