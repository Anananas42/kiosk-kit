import { createHash } from "node:crypto";

/**
 * Derives a deterministic 9-digit pairing code from a Tailscale node ID.
 * Both the device and web-server compute the same code independently.
 */
export function derivePairingCode(tailscaleNodeId: string): string {
  const hash = createHash("sha256").update(tailscaleNodeId).digest();
  const num = hash.readUInt32BE(0) % 1_000_000_000;
  return num.toString().padStart(9, "0");
}
