import type { FormEvent } from "react";

export type ExpandedNetwork = { ssid: string; type: "saved" | "available" } | null;

export interface NetworkActions {
  connecting: boolean;
  forgetting: string | null;
  password: string;
  setPassword: (v: string) => void;
  expanded: ExpandedNetwork;
  toggleExpand: (ssid: string, type: "saved" | "available") => void;
  handleConnect: (e: FormEvent, ssid: string, pwd?: string) => void;
  handleForget: (ssid: string) => void;
}
