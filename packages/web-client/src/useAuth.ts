import { useEffect, useState } from "react";
import { fetchMe, type User } from "./api.js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch((err) => {
        console.error("[auth] Failed to fetch user:", err);
        setError(err instanceof Error ? err.message : "Failed to check authentication");
      })
      .finally(() => setLoading(false));
  }, []);

  return { user, setUser, loading, error };
}
