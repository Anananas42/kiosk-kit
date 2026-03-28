import { and, desc, eq } from "drizzle-orm";
import { releases } from "../../db/schema.js";
import { authedProcedure, router } from "../trpc.js";

export const releasesRouter = router({
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
});
