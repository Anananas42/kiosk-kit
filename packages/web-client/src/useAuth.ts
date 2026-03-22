import { useEffect, useState } from "react";
import { fetchMe, type User } from "./api.js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  return { user, setUser, loading };
}
