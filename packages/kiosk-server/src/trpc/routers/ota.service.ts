import { rm } from "node:fs/promises";
import { type OtaStatus, OtaStep } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import {
  type ProgressJson,
  readJsonFile,
  readTextFile,
  runSudoScript,
  writeStateFile,
} from "../../lib/update-helpers.js";

const STATE_DIR = "/data/ota";
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

async function writeState(state: StateJson): Promise<void> {
  await writeStateFile(STATE_DIR, STATE_FILE, state);
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

  await writeState({
    ...currentState,
    status: OtaStep.Installing,
  });

  await runSudoScript("ota-install.sh", [ROOTFS_IMAGE]);
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

  await writeState({
    status: OtaStep.Idle,
    lastUpdate: currentState.lastUpdate,
    lastResult: currentState.lastResult,
  } as StateJson);
}

export async function rollbackAndReboot(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  await writeState({
    status: OtaStep.Rollback,
    lastUpdate: currentState?.lastUpdate ?? null,
    lastResult: currentState?.lastResult ?? null,
  } as StateJson);

  await runSudoScript("ota-rollback.sh");
}
