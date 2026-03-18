import { HEALTH_CHECK_INTERVAL_MS } from "@kioskkit/shared";
import { useEffect, useState } from "react";
import { fetchHealth } from "../api.js";

export function useHealth() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const check = () => {
      fetchHealth()
        .then((data) => setIsOffline(!data.online))
        .catch(() => setIsOffline(true));
    };
    check();
    const id = setInterval(check, HEALTH_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return isOffline;
}
