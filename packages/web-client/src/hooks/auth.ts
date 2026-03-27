import type { User } from "@kioskkit/shared";
import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "../api/auth.js";
import { queryClient } from "../queryClient.js";
import { queryKeys } from "./query-keys.js";

function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchMe,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export function useAuth() {
  const { data: user, isLoading: loading, error } = useMe();

  function setUser(u: User | null) {
    queryClient.setQueryData(queryKeys.me, u);
  }

  return {
    user: user ?? null,
    setUser,
    loading,
    error: error
      ? error instanceof Error
        ? error.message
        : "Failed to check authentication"
      : null,
  };
}
