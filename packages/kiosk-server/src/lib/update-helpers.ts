import { execFile as execFileCb, spawn } from "node:child_process";
import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";

const execFile = promisify(execFileCb);

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

export async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
 */
export function spawnDetachedSudoScript(script: string, args: string[] = []): void {
  const path = `${SCRIPTS_DIR}/${script}`;
  const child = spawn("sudo", [path, ...args], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export async function runSudoScript(script: string, args: string[] = []): Promise<string> {
  const path = `${SCRIPTS_DIR}/${script}`;
  try {
    const { stdout } = await execFile("sudo", [path, ...args]);
    return stdout;
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    const stdout = (err as { stdout?: string }).stdout ?? "";
    const output = stderr || stdout;
    let message: string;
    try {
      const parsed = JSON.parse(output) as { error?: string };
      message = parsed.error ?? (output.trim() || "Script failed");
    } catch {
      message = output.trim() || "Script failed";
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
  }
}
