import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { type OtaStatus, OtaStep } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import { runPrivileged } from "../../privileged.js";

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

export async function getOtaStatus(): Promise<OtaStatus> {
  const [state, bootSlot, version, progress] = await Promise.all([
    readJsonFile<StateJson>(STATE_FILE),
    readTextFile(BOOT_SLOT_FILE),
    readTextFile(VERSION_FILE),
    readJsonFile<ProgressJson>(PROGRESS_FILE),
  ]);

  const activeSlot = (bootSlot === "A" || bootSlot === "B" ? bootSlot : "A") as "A" | "B";

  return {
    status: state?.status ?? OtaStep.Idle,
    activeSlot,
    committedSlot: activeSlot,
    currentVersion: version ?? null,
    upload: state?.status === OtaStep.Uploading && progress ? progress : null,
    lastUpdate: state?.lastUpdate ?? null,
    lastResult: state?.lastResult ?? null,
  };
}

export async function installAndReboot(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  if (currentState?.status === OtaStep.Installing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Installation is already in progress",
    });
  }

  if (currentState?.status !== OtaStep.Downloaded) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No downloaded image available for installation",
    });
  }

  await writeStateFile({
    ...currentState,
    status: OtaStep.Installing,
  });

  await runPrivileged("ota-install", [ROOTFS_IMAGE]);
}

export async function cancelUpload(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  if (currentState?.status !== OtaStep.Uploading) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No upload in progress to cancel",
    });
  }

  await rm(PENDING_DIR, { recursive: true, force: true });

  await writeStateFile({
    status: OtaStep.Idle,
    lastUpdate: currentState.lastUpdate,
    lastResult: currentState.lastResult,
  } as StateJson);
}

export async function rollbackAndReboot(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  await writeStateFile({
    status: OtaStep.Rollback,
    lastUpdate: currentState?.lastUpdate ?? null,
    lastResult: currentState?.lastResult ?? null,
  } as StateJson);

  await runPrivileged("ota-rollback");
}
