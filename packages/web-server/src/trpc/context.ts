import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Context as HonoContext } from "hono";
import { validateSession } from "../auth/session.js";
import type { Db } from "../db/index.js";

export function createContextFactory(db: Db) {
  return async (_opts: FetchCreateContextFnOptions, c: HonoContext) => {
    const header = c.req.header("cookie");
    const match = header?.match(/(?:^|;\s*)session=([^;]*)/);
    const sessionId = match?.[1];

    if (!sessionId) return { db, user: null, session: null };

    const result = await validateSession(db, sessionId);
    if (!result) return { db, user: null, session: null };

    return { db, user: result.user, session: result.session };
  };
}

export type TrpcContext = Awaited<ReturnType<ReturnType<typeof createContextFactory>>>;
