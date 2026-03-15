import { useEffect, useState } from 'react';

const IDLE_MS = 15_000;

export function useIdleDim() {
  const [dimmed, setDimmed] = useState(false);

  useEffect(() => {
    let timer = setTimeout(() => setDimmed(true), IDLE_MS);

    const wake = () => {
      setDimmed(false);
      clearTimeout(timer);
      timer = setTimeout(() => setDimmed(true), IDLE_MS);
    };

    window.addEventListener('pointerdown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', wake);
    };
  }, []);

  return dimmed;
}
