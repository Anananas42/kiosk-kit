import type { WifiStatus } from "@kioskkit/shared";
import type { FormEvent } from "react";
import { useState } from "react";
import { trpc } from "../../trpc.js";
import type { ExpandedNetwork, NetworkActions } from "./types.js";

interface UseNetworkActionsOptions {
  status: WifiStatus | null;
  reload: () => void;
  onError: (msg: string) => void;
  onClearError: () => void;
}

interface UseNetworkActionsResult extends NetworkActions {
  showForgetWarning: string | null;
  doForget: (ssid: string) => void;
  dismissForgetWarning: () => void;
}

export function useNetworkActions({
  status,
  reload,
  onError,
  onClearError,
}: UseNetworkActionsOptions): UseNetworkActionsResult {
  const [expanded, setExpanded] = useState<ExpandedNetwork>(null);
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [showForgetWarning, setShowForgetWarning] = useState<string | null>(null);

  const toggleExpand = (ssid: string, type: "saved" | "available") => {
    if (expanded?.ssid === ssid && expanded.type === type) {
      setExpanded(null);
    } else {
      setExpanded({ ssid, type });
      setPassword("");
    }
    onClearError();
  };

  const handleConnect = (e: FormEvent, ssid: string, pwd?: string) => {
    e.preventDefault();
    setConnecting(true);
    onClearError();
    trpc["admin.network.connect"]
      .mutate({ ssid, password: pwd || undefined })
      .then(() => {
        setExpanded(null);
        setPassword("");
        reload();
      })
      .catch(() => onError("Could not connect — check password and try again"))
      .finally(() => setConnecting(false));
  };

  const doForget = (ssid: string) => {
    setForgetting(ssid);
    onClearError();
    setShowForgetWarning(null);
    trpc["admin.network.forget"]
      .mutate({ ssid })
      .then(() => reload())
      .catch((err: Error) => onError(err.message))
      .finally(() => setForgetting(null));
  };

  const handleForget = (ssid: string) => {
    if (!status) return;

    if (
      status.current?.ssid === ssid &&
      !status.ethernet &&
      !status.saved.some((s) => s.ssid !== ssid && s.inRange)
    ) {
      setShowForgetWarning(ssid);
      return;
    }

    doForget(ssid);
  };

  return {
    expanded,
    password,
    setPassword,
    connecting,
    forgetting,
    toggleExpand,
    handleConnect,
    handleForget,
    showForgetWarning,
    doForget,
    dismissForgetWarning: () => setShowForgetWarning(null),
  };
}
