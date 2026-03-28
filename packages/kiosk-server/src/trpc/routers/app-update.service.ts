import { rm } from "node:fs/promises";
import { type AppUpdateStatus, AppUpdateStep } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";
import {
  APP_PKG_VERSION_FILE,
  APP_RELEASES_DIR,
  APP_UPDATE_BUNDLE_FILE,
  APP_UPDATE_PENDING_DIR,
  APP_UPDATE_PROGRESS_FILE,
  APP_UPDATE_STATE_DIR,
  APP_UPDATE_STATE_FILE,
  APP_VERSION_FILE,
} from "../../lib/app-update-constants.js";
import {
  countDirEntries,
  isMutatingOperation,
  type ProgressJson,
  readJsonFile,
  readTextFile,
  spawnDetachedSudoScript,
  writeStateFile,
} from "../../lib/app-update-helpers.js";

interface StateJson {
  status: AppUpdateStatus["status"];
  version?: string;
  lastUpdate?: string;
  lastResult?: AppUpdateStatus["lastResult"];
}

async function writeState(state: StateJson): Promise<void> {
  await writeStateFile(APP_UPDATE_STATE_DIR, APP_UPDATE_STATE_FILE, state);
}

async function readAppVersion(): Promise<string | null> {
  // Try dedicated app-version file first
  const version = await readTextFile(APP_VERSION_FILE);
  if (version) return version;

  // Fall back to package.json version
  const pkg = await readJsonFile<{ version?: string }>(APP_PKG_VERSION_FILE);
  return pkg?.version ?? null;
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  const [state, version, progress, releaseCount] = await Promise.all([
    readJsonFile<StateJson>(APP_UPDATE_STATE_FILE),
    readAppVersion(),
    readJsonFile<ProgressJson>(APP_UPDATE_PROGRESS_FILE),
    countDirEntries(APP_RELEASES_DIR),
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
  const currentState = await readJsonFile<StateJson>(APP_UPDATE_STATE_FILE);

  if (isMutatingOperation(currentState?.status)) {
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
  spawnDetachedSudoScript("app-update.sh", [APP_UPDATE_BUNDLE_FILE]);
}

export async function cancelUpload(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(APP_UPDATE_STATE_FILE);

  if (currentState?.status !== AppUpdateStep.Uploading) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No upload in progress to cancel",
    });
  }

  await rm(APP_UPDATE_PENDING_DIR, { recursive: true, force: true });

  await writeState({
    status: AppUpdateStep.Idle,
    lastUpdate: currentState.lastUpdate,
    lastResult: currentState.lastResult,
  });
}

export async function rollbackApp(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(APP_UPDATE_STATE_FILE);

  if (isMutatingOperation(currentState?.status)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Cannot rollback while an install or rollback is in progress",
    });
  }

  const releaseCount = await countDirEntries(APP_RELEASES_DIR);
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
