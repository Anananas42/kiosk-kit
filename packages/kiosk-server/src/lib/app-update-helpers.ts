import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AppUpdateStep } from "@kioskkit/shared";

const SCRIPTS_DIR = "/opt/kioskkit/system";

export interface ProgressJson {
  version: string;
  progress: number;
  bytesReceived: number;
  bytesTotal: number;
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function readTextFile(path: string): Promise<string | null> {
  try {
    return (await readFile(path, "utf-8")).trim();
  } catch {
    return null;
  }
}

export async function countDirEntries(path: string): Promise<number> {
  try {
    const entries = await readdir(path);
    return entries.length;
  } catch {
    return 0;
  }
}

export function isActiveOperation(status: string | undefined): boolean {
  return (
    status === AppUpdateStep.Uploading ||
    status === AppUpdateStep.Installing ||
    status === AppUpdateStep.RollingBack
  );
}

export function isMutatingOperation(status: string | undefined): boolean {
  return status === AppUpdateStep.Installing || status === AppUpdateStep.RollingBack;
}

export function hasRequiredUploadHeaders(
  version: string | undefined,
  sha256: string | undefined,
  contentLength: string | undefined,
): version is string {
  return Boolean(version && sha256 && contentLength);
}

export async function writeStateFile(
  stateDir: string,
  stateFile: string,
  state: object,
): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  const tmp = join(stateDir, `.state.${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, stateFile);
}

/**
 * Spawn a sudo script detached so it survives the Node process being killed
 * (e.g. by systemctl restart). Returns immediately — caller should set state
 * before calling and let the script write final state.
 *
 * This is used instead of the OTA service's runSudoScript/execFile pattern
 * because app-update restarts the Node process (systemctl restart) rather than
 * rebooting the whole system. The detached spawn ensures the script outlives
 * the process it kills.
 */
export function spawnDetachedSudoScript(script: string, args: string[] = []): void {
  const path = `${SCRIPTS_DIR}/${script}`;
  const child = spawn("sudo", [path, ...args], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
