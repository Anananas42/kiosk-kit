import {
  BOOT_NETWORK_POLL_MS,
  BOOT_PAIRING_POLL_MS,
  BOOT_TAILSCALE_POLL_MS,
} from "@kioskkit/shared";
import { useEffect, useRef, useState } from "react";

import { trpc } from "../trpc.js";

export enum BootState {
  Connecting = "connecting",
  NoNetworkNoWifi = "no_network_no_wifi",
  NoNetworkHasWifi = "no_network_has_wifi",
  ConnectingCloud = "connecting_cloud",
  Pairing = "pairing",
  Ready = "ready",
}

interface NetworkStatus {
  hasNetwork: boolean;
  hasSavedWifi: boolean;
}

function isNetworkCheckState(state: BootState): boolean {
  return (
    state === BootState.Connecting ||
    state === BootState.NoNetworkNoWifi ||
    state === BootState.NoNetworkHasWifi
  );
}

function getPollInterval(state: BootState): number {
  if (state === BootState.Pairing) return BOOT_PAIRING_POLL_MS;
  if (state === BootState.ConnectingCloud) return BOOT_TAILSCALE_POLL_MS;
  return BOOT_NETWORK_POLL_MS;
}

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

async function fetchPairingStatus(): Promise<{ code: string; consumed: boolean }> {
  const res = await fetch("/api/pairing");
  if (!res.ok) throw new Error("Failed to fetch pairing status");
  return (await res.json()) as { code: string; consumed: boolean };
}

export function useBootState() {
  const [state, setState] = useState<BootState>(BootState.Connecting);
  const [pairingCode, setPairingCode] = useState<string>("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (state === BootState.Ready) return;

    async function pollOnce() {
      try {
        if (isNetworkCheckState(state)) {
          const net = await fetchNetworkStatus();
          if (!net.hasNetwork) {
            setState(net.hasSavedWifi ? BootState.NoNetworkHasWifi : BootState.NoNetworkNoWifi);
          } else {
            setState(BootState.ConnectingCloud);
          }
          return;
        }

        if (state === BootState.ConnectingCloud) {
          const connected = await fetchTailscaleConnected();
          if (connected) {
            setState(BootState.Pairing);
          }
          return;
        }

        if (state === BootState.Pairing) {
          const pairing = await fetchPairingStatus();
          setPairingCode(pairing.code);
          if (pairing.consumed) {
            setState(BootState.Ready);
          }
        }
      } catch {
        // On error, stay in current state and retry next cycle
      }
    }

    async function loop() {
      await pollOnce();
      timeoutRef.current = setTimeout(loop, getPollInterval(state));
    }

    loop();

    return () => clearTimeout(timeoutRef.current);
  }, [state]);

  return { state, pairingCode };
}
