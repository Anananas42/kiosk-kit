import { useEffect, useState } from 'react';
import { IDLE_DIM_MS } from '@zahumny/shared';


export function useIdleDim() {
  const [dimmed, setDimmed] = useState(false);

  useEffect(() => {
    let timer = setTimeout(() => setDimmed(true), IDLE_DIM_MS);

    const wake = () => {
      setDimmed(false);
      clearTimeout(timer);
      timer = setTimeout(() => setDimmed(true), IDLE_DIM_MS);
    };

    window.addEventListener('pointerdown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', wake);
    };
  }, []);

  return dimmed;
}
