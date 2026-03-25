import { execSync } from "node:child_process";
import type { AppRouter } from "@kioskkit/kiosk-server/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

const BASE_URL = process.env.KIOSK_SIM_URL ?? "http://localhost:3001";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${BASE_URL}/api/trpc`,
    }),
  ],
});

export async function waitForHealthy(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  const url = `${BASE_URL}/api/health`;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 204 || res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Simulator not healthy after ${timeoutMs}ms`);
}

export function resetMockState(): void {
  const container = getContainerName();
  execSync(`docker exec ${container} /opt/kioskkit/system/reset-state.sh`, {
    stdio: "pipe",
  });
}

function getContainerName(): string {
  // Find the running kiosk-sim container
  const output = execSync('docker ps --filter "name=kiosk-sim" --format "{{.Names}}"', {
    encoding: "utf-8",
  }).trim();
  const name = output.split("\n")[0];
  if (!name) throw new Error("No running kiosk-sim container found");
  return name;
}
