import { IDLE_DIM_MS } from "@kioskkit/shared";
import { useEffect, useState } from "react";

export function useIdleDim(idleDimMs: number = IDLE_DIM_MS) {
  const [dimmed, setDimmed] = useState(false);

  useEffect(() => {
    let timer = setTimeout(() => setDimmed(true), idleDimMs);

    const wake = () => {
      setDimmed(false);
      clearTimeout(timer);
      timer = setTimeout(() => setDimmed(true), idleDimMs);
    };

    window.addEventListener("pointerdown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", wake);
    };
  }, [idleDimMs]);

  return dimmed;
}
