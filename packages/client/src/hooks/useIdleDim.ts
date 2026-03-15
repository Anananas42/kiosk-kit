import { useEffect, useState, useCallback, useRef } from 'react';

const IDLE_MS = 15_000;
const WAKE_COOLDOWN_MS = 800;

export function useIdleDim() {
  const [dimmed, setDimmed] = useState(false);
  const [waking, setWaking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const resetTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDimmed(true), IDLE_MS);
  }, []);

  // Reset idle timer on any touch (when not dimmed/waking)
  useEffect(() => {
    resetTimer();
    window.addEventListener('pointerdown', resetTimer);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('pointerdown', resetTimer);
    };
  }, [resetTimer]);

  // Called by the overlay's pointerdown — absorbs the wake touch
  // Overlay stays up during cooldown to block touches from reaching the UI
  const wake = useCallback(() => {
    setDimmed(false);
    setWaking(true);
    resetTimer();
    setTimeout(() => setWaking(false), WAKE_COOLDOWN_MS);
  }, [resetTimer]);

  // Show overlay when dimmed OR during wake cooldown
  const blocked = dimmed || waking;

  return { blocked, wake };
}
