import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Manages a local draft that tracks server state with dirty detection.
 * Returns the draft, a setter, whether the draft differs from server state,
 * and a cancel function to reset back to server state.
 */
export function useDraftState<T>(serverState: T | undefined) {
  const [draft, setDraft] = useState<T | undefined>(undefined);

  // Sync draft when server state loads or updates (after save + invalidation)
  useEffect(() => {
    if (serverState !== undefined) {
      setDraft(structuredClone(serverState));
    }
  }, [serverState]);

  const isDirty = useMemo(() => {
    if (draft === undefined || serverState === undefined) return false;
    return JSON.stringify(draft) !== JSON.stringify(serverState);
  }, [draft, serverState]);

  const cancel = useCallback(() => {
    if (serverState !== undefined) {
      setDraft(structuredClone(serverState));
    }
  }, [serverState]);

  return { draft, setDraft, isDirty, cancel } as const;
}
