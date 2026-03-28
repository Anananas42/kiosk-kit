import { execFile as execFileCb } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { type AppUpdateStatus, AppUpdateStep } from "@kioskkit/shared";
import { TRPCError } from "@trpc/server";

const execFile = promisify(execFileCb);

const SCRIPTS_DIR = "/opt/kioskkit/system/scripts";
const STATE_FILE = "/data/app-update/state.json";
const VERSION_FILE = "/etc/kioskkit/app-version";
const PKG_VERSION_FILE = "/opt/kioskkit/package.json";
const PROGRESS_FILE = "/data/app-update/pending/progress.json";
const PENDING_DIR = "/data/app-update/pending";
const BUNDLE_FILE = "/data/app-update/pending/app-bundle.tar.gz";
const ROLLBACK_DIR = "/opt/kioskkit/.rollback";

interface StateJson {
  status: AppUpdateStatus["status"];
  version?: string;
  lastUpdate?: string;
  lastResult?: AppUpdateStatus["lastResult"];
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
  await mkdir("/data/app-update", { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

async function readAppVersion(): Promise<string | null> {
  // Try dedicated app-version file first
  const version = await readTextFile(VERSION_FILE);
  if (version) return version;

  // Fall back to package.json version
  const pkg = await readJsonFile<{ version?: string }>(PKG_VERSION_FILE);
  return pkg?.version ?? null;
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  const [state, version, progress, rollbackExists] = await Promise.all([
    readJsonFile<StateJson>(STATE_FILE),
    readAppVersion(),
    readJsonFile<ProgressJson>(PROGRESS_FILE),
    dirExists(ROLLBACK_DIR),
  ]);

  return {
    status: state?.status ?? AppUpdateStep.Idle,
    currentVersion: version ?? null,
    upload: state?.status === AppUpdateStep.Uploading && progress ? progress : null,
    lastUpdate: state?.lastUpdate ?? null,
    lastResult: state?.lastResult ?? null,
    rollbackAvailable: rollbackExists,
  };
}

export async function installApp(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  if (currentState?.status === AppUpdateStep.Installing) {
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

  await writeStateFile({
    ...currentState,
    status: AppUpdateStep.Installing,
  });

  await runSudoScript("app-update.sh", [BUNDLE_FILE]);
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

  await writeStateFile({
    status: AppUpdateStep.Idle,
    lastUpdate: currentState.lastUpdate,
    lastResult: currentState.lastResult,
  } as StateJson);
}

export async function rollbackApp(): Promise<void> {
  const currentState = await readJsonFile<StateJson>(STATE_FILE);

  const hasRollback = await dirExists(ROLLBACK_DIR);
  if (!hasRollback) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No rollback available",
    });
  }

  await writeStateFile({
    status: AppUpdateStep.Installing,
    lastUpdate: currentState?.lastUpdate ?? null,
    lastResult: currentState?.lastResult ?? null,
  } as StateJson);

  await runSudoScript("app-rollback.sh");
}
