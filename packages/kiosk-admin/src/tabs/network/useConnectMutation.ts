import type { WifiStatus } from "@kioskkit/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

export function useConnectMutation(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ssid: string; password?: string }) =>
      trpc["admin.network.connect"].mutate(input),
    onSuccess: (_data, { ssid }) => {
      toast.success("Connected");
      onSuccess?.();

      const cached = queryClient.getQueryData<WifiStatus>(queryKeys.network.status());
      if (cached) {
        const network =
          cached.available.find((n) => n.ssid === ssid) ??
          cached.saved.find((n) => n.ssid === ssid);
        if (network) {
          queryClient.setQueryData<WifiStatus>(queryKeys.network.status(), {
            ...cached,
            current: {
              ssid,
              signal: network.signal ?? -50,
              security: network.security,
            },
            available: cached.available.filter((n) => n.ssid !== ssid),
            saved: cached.saved.filter((n) => n.ssid !== ssid),
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.network.status() });
    },
    onError: (error: Error) => {
      const message = error.message;
      if (message) {
        toast.error(`Connection failed: ${message}`);
      } else {
        toast.error("Could not connect — check password and try again");
      }
    },
  });
}
