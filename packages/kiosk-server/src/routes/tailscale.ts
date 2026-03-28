import { execFile } from "node:child_process";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";

function checkTailscale(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("tailscale", ["status", "--json"], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      try {
        const status = JSON.parse(stdout);
        resolve(status.BackendState === "Running");
      } catch {
        resolve(false);
      }
    });
  });
}

export function tailscaleRoute() {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "Tailscale connection status",
      description: "Returns whether the device is connected to the Tailscale network.",
      responses: {
        200: { description: "Tailscale connection status" },
      },
    }),
    async (c) => {
      const connected = await checkTailscale();
      return c.json({ connected });
    },
  );

  return app;
}
