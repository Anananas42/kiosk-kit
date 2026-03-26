import { execFile as execFileCb } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { OtaStatus } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";

const execFile = promisify(execFileCb);

const SCRIPTS_DIR = "/opt/kioskkit/system";
const STATE_FILE = "/data/ota/state.json";
const BOOT_SLOT_FILE = "/data/ota/boot-slot";
const VERSION_FILE = "/etc/kioskkit/version";
const PROGRESS_FILE = "/data/ota/pending/progress.json";
const PENDING_DIR = "/data/ota/pending";
const ROOTFS_IMAGE = "/data/ota/pending/rootfs.img.zst";

interface StateJson {
  status: OtaStatus["status"];
  version?: string;
  lastUpdate?: string;
  lastResult?: OtaStatus["lastResult"];
}

interface ProgressJson {
  version: string;
  progress: number;
  bytesReceived: number;
  bytesTotal: number;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    return (await readFile(path, "utf-8")).trim();
  } catch {
    return null;
  }
}

async function writeStateFile(state: StateJson): Promise<void> {
  await mkdir("/data/ota", { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function runSudoScript(script: string, args: string[] = []): Promise<string> {
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

export async function getOtaStatus(): Promise<OtaStatus> {
  const [state, bootSlot, version, progress] = await Promise.all([
    readJsonFile<StateJson>(STATE_FILE),
    readTextFile(BOOT_SLOT_FILE),
    readTextFile(VERSION_FILE),
    readJsonFile<ProgressJson>(PROGRESS_FILE),
  ]);

  const activeSlot = (bootSlot === "A" || bootSlot === "B" ? bootSlot : "A") as "A" | "B";

  return {
    status: state?.status ?? "idle",
    activeSlot,
    committedSlot: activeSlot,
    currentVersion: version ?? null,
    upload: state?.status === "uploading" && progress ? progress : null,
    lastUpdate: state?.lastUpdate ?? null,
    lastResult: state?.lastResult ?? null,
  };
}

export async function installAndReboot(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  if (currentState?.status === "installing") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Installation is already in progress",
    });
  }

  if (currentState?.status !== "downloaded") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No downloaded image available for installation",
    });
  }

  await writeStateFile({
    ...currentState,
    status: "installing",
  });

  await runSudoScript("ota-install.sh", [ROOTFS_IMAGE]);
}

export async function cancelUpload(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  if (currentState?.status !== "uploading") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No upload in progress to cancel",
    });
  }

  await rm(PENDING_DIR, { recursive: true, force: true });

  await writeStateFile({
    status: "idle",
    lastUpdate: currentState.lastUpdate,
    lastResult: currentState.lastResult,
  } as StateJson);
}

export async function rollbackAndReboot(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  await writeStateFile({
    status: "rollback",
    lastUpdate: currentState?.lastUpdate ?? null,
    lastResult: currentState?.lastResult ?? null,
  } as StateJson);

  await runSudoScript("ota-rollback.sh");
}
