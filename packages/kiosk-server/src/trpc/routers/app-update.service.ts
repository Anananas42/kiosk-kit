import { rm } from "node:fs/promises";
import { type AppUpdateStatus, AppUpdateStep } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import {
  countDirEntries,
  type ProgressJson,
  readJsonFile,
  readTextFile,
  spawnDetachedSudoScript,
  writeStateFile,
} from "../../lib/app-update-helpers.js";

const STATE_DIR = "/data/app-update";
const STATE_FILE = "/data/app-update/state.json";
const VERSION_FILE = "/etc/kioskkit/app-version";
const PKG_VERSION_FILE = "/opt/kioskkit/current/package.json";
const PROGRESS_FILE = "/data/app-update/pending/progress.json";
const PENDING_DIR = "/data/app-update/pending";
// Must match the sudoers rule in deploy/pi/ansible/roles/kioskkit/templates/sudoers-app-update.j2
const BUNDLE_FILE = "/data/app-update/pending/app-bundle.tar.gz";
const RELEASES_DIR = "/opt/kioskkit/releases";

interface StateJson {
  status: AppUpdateStatus["status"];
  version?: string;
  lastUpdate?: string;
  lastResult?: AppUpdateStatus["lastResult"];
}

async function writeState(state: StateJson): Promise<void> {
  await writeStateFile(STATE_DIR, STATE_FILE, state);
}

async function readAppVersion(): Promise<string | null> {
  // Try dedicated app-version file first
  const version = await readTextFile(VERSION_FILE);
  if (version) return version;

  // Fall back to package.json version
  const pkg = await readJsonFile<{ version?: string }>(PKG_VERSION_FILE);
  return pkg?.version ?? null;
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  const [state, version, progress, releaseCount] = await Promise.all([
    readJsonFile<StateJson>(STATE_FILE),
    readAppVersion(),
    readJsonFile<ProgressJson>(PROGRESS_FILE),
    countDirEntries(RELEASES_DIR),
  ]);

  return {
    status: state?.status ?? AppUpdateStep.Idle,
    currentVersion: version ?? null,
    upload: state?.status === AppUpdateStep.Uploading && progress ? progress : null,
    lastUpdate: state?.lastUpdate ?? null,
    lastResult: state?.lastResult ?? null,
    rollbackAvailable: releaseCount >= 2,
  };
}

export async function installApp(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  if (
    currentState?.status === AppUpdateStep.Installing ||
    currentState?.status === AppUpdateStep.RollingBack
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Installation is already in progress",
    });
  }

  if (currentState?.status !== AppUpdateStep.Downloaded) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No downloaded bundle available for installation",
    });
  }

  await writeState({
    ...currentState,
    status: AppUpdateStep.Installing,
  });

  // Fire-and-forget: the script restarts the service (killing this process),
  // so we spawn detached and return immediately. The script writes final state.
  spawnDetachedSudoScript("app-update.sh", [BUNDLE_FILE]);
}

export async function cancelUpload(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  if (currentState?.status !== AppUpdateStep.Uploading) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No upload in progress to cancel",
    });
  }

  await rm(PENDING_DIR, { recursive: true, force: true });

  await writeState({
    status: AppUpdateStep.Idle,
    lastUpdate: currentState.lastUpdate,
    lastResult: currentState.lastResult,
  });
}

export async function rollbackApp(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  if (
    currentState?.status === AppUpdateStep.Installing ||
    currentState?.status === AppUpdateStep.RollingBack
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Cannot rollback while an install or rollback is in progress",
    });
  }

  const releaseCount = await countDirEntries(RELEASES_DIR);
  if (releaseCount < 2) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No rollback available",
    });
  }

  await writeState({
    status: AppUpdateStep.RollingBack,
    lastUpdate: currentState?.lastUpdate,
    lastResult: currentState?.lastResult,
  });

  // Fire-and-forget: the script restarts the service (killing this process),
  // so we spawn detached and return immediately. The script writes final state.
  spawnDetachedSudoScript("app-rollback.sh");
}
