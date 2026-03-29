import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export const queryKeys = {
  buyers: {
    list: () => ["buyers", "list"] as const,
  },
  catalog: {
    list: () => ["catalog", "list"] as const,
  },
  settings: {
    get: () => ["settings"] as const,
  },
  network: {
    status: () => ["network", "status"] as const,
  },
  consumption: {
    report: () => ["consumption", "report"] as const,
    summary: (from: string, to?: string) => ["consumption", "summary", from, to] as const,
    logs: (from: string, to?: string) => ["consumption", "logs", from, to] as const,
  },
  preorder: {
    config: () => ["preorder", "config"] as const,
    report: () => ["preorder", "report"] as const,
  },
};
