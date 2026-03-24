import { HEALTH_CHECK_INTERVAL_MS } from "@kioskkit/shared";
import { useEffect, useState } from "react";

async function fetchHealth(): Promise<void> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
}

export function useHealth() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const check = () => {
      fetchHealth()
        .then(() => setIsOffline(false))
        .catch(() => setIsOffline(true));
    };
    check();
    const id = setInterval(check, HEALTH_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return isOffline;
}
