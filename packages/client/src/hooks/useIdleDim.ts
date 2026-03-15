import { useEffect, useState, useCallback, useRef } from 'react';

const DIM_MS = 15_000;
const DPMS_MS = 900_000; // 15 minutes — must match swayidle timeout
const DPMS_WAKE_COOLDOWN_MS = 5_000;

export function useIdleDim() {
  const [dimmed, setDimmed] = useState(false);
  const [waking, setWaking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const idleSinceRef = useRef(Date.now());

  const resetTimer = useCallback(() => {
    idleSinceRef.current = Date.now();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDimmed(true), DIM_MS);
  }, []);

  useEffect(() => {
    resetTimer();

    const onTouch = () => {
      const idleDuration = Date.now() - idleSinceRef.current;

      // If display was likely off (DPMS), block touches while it powers on
      if (idleDuration >= DPMS_MS) {
        setWaking(true);
        setTimeout(() => setWaking(false), DPMS_WAKE_COOLDOWN_MS);
      }

      setDimmed(false);
      resetTimer();
    };

    window.addEventListener('pointerdown', onTouch);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('pointerdown', onTouch);
    };
  }, [resetTimer]);

  return { dimmed, waking };
}
