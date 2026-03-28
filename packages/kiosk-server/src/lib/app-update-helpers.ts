import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AppUpdateStep } from "@kioskkit/shared";

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
