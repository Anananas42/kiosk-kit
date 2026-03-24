import { MeOutputSchema } from "@kioskkit/shared";
import { publicProcedure, router } from "../trpc.js";

export const meRouter = router({
  me: publicProcedure.output(MeOutputSchema).query(({ ctx }) => {
    if (!ctx.user) return { user: null };
    return {
      user: {
        id: ctx.user.id,
        name: ctx.user.name ?? "",
        email: ctx.user.email,
        role: ctx.user.role,
      },
    };
  }),
});
