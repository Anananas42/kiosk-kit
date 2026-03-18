import { useEffect, useState, useCallback } from 'react';
import { INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS } from '@kioskkit/shared';


export function useInactivityReset(active: boolean, onReset: () => void, timeoutMs: number = INACTIVITY_TIMEOUT_MS) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const dismiss = useCallback(() => setSecondsLeft(null), []);

  useEffect(() => {
    if (!active) {
      setSecondsLeft(null);
      return;
    }

    let warningTimer: ReturnType<typeof setTimeout>;
    let countdownInterval: ReturnType<typeof setInterval>;

    const startTimers = () => {
      clearTimeout(warningTimer);
      clearInterval(countdownInterval);
      setSecondsLeft(null);

      warningTimer = setTimeout(() => {
        let remaining = Math.ceil(INACTIVITY_WARNING_MS / 1000);
        setSecondsLeft(remaining);
        countdownInterval = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearInterval(countdownInterval);
            onReset();
          } else {
            setSecondsLeft(remaining);
          }
        }, 1000);
      }, timeoutMs - INACTIVITY_WARNING_MS);
    };

    startTimers();

    const restart = () => startTimers();
    window.addEventListener('pointerdown', restart);
    return () => {
      clearTimeout(warningTimer);
      clearInterval(countdownInterval);
      window.removeEventListener('pointerdown', restart);
    };
  }, [active, onReset, timeoutMs]);

  return { secondsLeft, dismiss };
}
