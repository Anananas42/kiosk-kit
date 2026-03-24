import { UserListItemSchema } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema.js";
import { adminProcedure, router } from "../trpc.js";

export const usersRouter = router({
  "users.list": adminProcedure.output(z.array(UserListItemSchema)).query(async ({ ctx }) => {
    const result = await ctx.db.select().from(users);
    return result.map((u) => ({
      id: u.id,
      name: u.name ?? "",
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    }));
  }),

  "users.getOne": adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .output(UserListItemSchema)
    .query(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.id, input.id));

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      return {
        id: user.id,
        name: user.name ?? "",
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      };
    }),
});
