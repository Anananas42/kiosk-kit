import type { AdminRouter } from "@kioskkit/web-server/trpc";
import type { CreateTRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

export const trpc: CreateTRPCClient<AdminRouter> = createTRPCClient<AdminRouter>({
  links: [
    httpBatchLink({
      url: "/api/admin/trpc",
    }),
  ],
});
