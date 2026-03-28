import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { WifiNetwork, WifiStatus } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { runPrivileged } from "../../privileged.js";

const execFile = promisify(execFileCb);

const SCRIPTS_DIR = "/opt/kioskkit/system";

async function runScript(script: string, args: string[] = []): Promise<string> {
  const path = `${SCRIPTS_DIR}/${script}`;
  try {
    const { stdout } = await execFile(path, args);
    return stdout;
  } catch (err: unknown) {
    const message = parseScriptError(err);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
  }
}

function parseScriptError(err: unknown): string {
  const stderr = (err as { stderr?: string }).stderr ?? "";
  const stdout = (err as { stdout?: string }).stdout ?? "";
  const output = stderr || stdout;
  try {
    const parsed = JSON.parse(output) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON
  }
  return output.trim() || "Script failed";
}

function parseJson<T>(stdout: string, label: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to parse ${label} output`,
    });
  }
}

async function isWifiEnabled(): Promise<boolean> {
  try {
    await execFile("systemctl", ["is-active", "--quiet", "wpa_supplicant@wlan0.service"]);
    return true;
  } catch {
    return false;
  }
}

export async function getWifiStatus(): Promise<WifiStatus> {
  const enabled = await isWifiEnabled();
  if (!enabled) {
    return { enabled: false, current: null, ethernet: false, saved: [], available: [] };
  }

  const [scanOutput, statusOutput] = await Promise.all([
    runScript("wifi-scan.sh"),
    runScript("wifi-status.sh"),
  ]);

  const scanned = parseJson<WifiNetwork[]>(scanOutput, "wifi-scan");
  const status = parseJson<{
    current: { ssid: string; signal: number } | null;
    ethernet: boolean;
    saved: { ssid: string }[];
  }>(statusOutput, "wifi-status");

  const scannedBySsid = new Map(scanned.map((n) => [n.ssid, n]));
  const savedSsids = new Set(status.saved.map((s) => s.ssid));

  const saved = status.saved.map((s) => {
    const scan = scannedBySsid.get(s.ssid);
    return {
      ssid: s.ssid,
      inRange: !!scan,
      ...(scan ? { signal: scan.signal } : {}),
    };
  });

  const available = scanned.filter((n) => !savedSsids.has(n.ssid));

  return {
    enabled: true,
    current: status.current,
    ethernet: status.ethernet,
    saved,
    available,
  };
}

export async function connectToWifi(ssid: string, password?: string): Promise<void> {
  const args = [ssid];
  if (password) args.push(password);
  await runPrivileged("wifi-connect", args);
}

export async function forgetWifi(ssid: string): Promise<void> {
  await runPrivileged("wifi-forget", [ssid]);
}

export async function enableWifi(): Promise<void> {
  await runPrivileged("wifi-enable");
}

export async function disableWifi(): Promise<void> {
  await runPrivileged("wifi-disable");
}
