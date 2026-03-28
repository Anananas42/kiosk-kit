import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

export function useConnectMutation(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ssid: string; password?: string }) =>
      trpc["admin.network.connect"].mutate(input),
    onSuccess: () => {
      toast.success("Connected");
      onSuccess?.();
      queryClient.invalidateQueries({ queryKey: queryKeys.network.status() });
    },
    onError: () => toast.error("Could not connect — check password and try again"),
  });
}
