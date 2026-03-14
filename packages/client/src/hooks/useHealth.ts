import { useState, useEffect } from 'react';
import { fetchHealth } from '../api.js';

export function useHealth() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const check = () => {
      fetchHealth()
        .then((data) => setIsOffline(!data.online))
        .catch(() => setIsOffline(true));
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, []);

  return isOffline;
}
