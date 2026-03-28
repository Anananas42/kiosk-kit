import {
  BOOT_NETWORK_POLL_MS,
  BOOT_PAIRING_POLL_MS,
  BOOT_TAILSCALE_POLL_MS,
} from "@kioskkit/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "../trpc.js";

export type BootState =
  | "connecting"
  | "no-network-no-wifi"
  | "no-network-has-wifi"
  | "connecting-cloud"
  | "pairing"
  | "ready";

interface NetworkStatus {
  hasNetwork: boolean;
  hasSavedWifi: boolean;
}

const PAIRING_CONSUMED_KEY = "kioskkit_pairing_consumed";

async function fetchNetworkStatus(): Promise<NetworkStatus> {
  const status = await trpc["admin.network.list"].query();
  const hasNetwork = status.ethernet || status.current !== null;
  const hasSavedWifi = status.saved.length > 0;
  return { hasNetwork, hasSavedWifi };
}

async function fetchTailscaleConnected(): Promise<boolean> {
  const res = await fetch("/api/tailscale");
  if (!res.ok) return false;
  const data = (await res.json()) as { connected: boolean };
  return data.connected;
}

async function fetchPairingConsumed(): Promise<{ code: string; consumed: boolean }> {
  const res = await fetch("/api/pairing");
  if (!res.ok) throw new Error("Failed to fetch pairing status");
  return (await res.json()) as { code: string; consumed: boolean };
}

export function useBootState() {
  const [state, setState] = useState<BootState>(() => {
    if (localStorage.getItem(PAIRING_CONSUMED_KEY) === "true") return "ready";
    return "connecting";
  });
  const [pairingCode, setPairingCode] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const poll = useCallback(async () => {
    if (state === "ready") return;

    try {
      if (
        state === "connecting" ||
        state === "no-network-no-wifi" ||
        state === "no-network-has-wifi"
      ) {
        const net = await fetchNetworkStatus();
        if (!net.hasNetwork) {
          setState(net.hasSavedWifi ? "no-network-has-wifi" : "no-network-no-wifi");
          return;
        }
        setState("connecting-cloud");
        return;
      }

      if (state === "connecting-cloud") {
        const connected = await fetchTailscaleConnected();
        if (!connected) return;
        setState("pairing");
        return;
      }

      if (state === "pairing") {
        const pairing = await fetchPairingConsumed();
        setPairingCode(pairing.code);
        if (pairing.consumed) {
          localStorage.setItem(PAIRING_CONSUMED_KEY, "true");
          setState("ready");
        }
      }
    } catch {
      // On error, stay in current state and retry next poll
    }
  }, [state]);

  useEffect(() => {
    if (state === "ready") return;

    // Run immediately on state change
    poll();

    const interval =
      state === "pairing"
        ? BOOT_PAIRING_POLL_MS
        : state === "connecting-cloud"
          ? BOOT_TAILSCALE_POLL_MS
          : BOOT_NETWORK_POLL_MS;

    timerRef.current = setInterval(poll, interval);
    return () => clearInterval(timerRef.current);
  }, [state, poll]);

  return { state, pairingCode };
}
