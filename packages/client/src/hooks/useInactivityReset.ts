import { useEffect } from 'react';

export function useInactivityReset(active: boolean, onReset: () => void, timeoutMs = 60_000) {
  useEffect(() => {
    if (!active) return;
    let timer = setTimeout(onReset, timeoutMs);
    const restart = () => { clearTimeout(timer); timer = setTimeout(onReset, timeoutMs); };
    window.addEventListener('pointerdown', restart);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', restart); };
  }, [active, onReset, timeoutMs]);
}
