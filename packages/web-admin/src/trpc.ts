import type { AppRouter } from "@kioskkit/web-server/trpc";
import type { CreateTRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

export const trpc: CreateTRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
    }),
  ],
});
