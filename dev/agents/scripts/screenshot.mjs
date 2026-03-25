#!/usr/bin/env node

/**
 * Takes screenshots of a local dev server page.
 *
 * Usage:
 *   node scripts/screenshot.mjs [url-or-package] [--full] [--width=1280] [--height=800]
 *
 * Examples:
 *   node scripts/screenshot.mjs                          # screenshots landing page (default)
 *   node scripts/screenshot.mjs @kioskkit/landing        # same, explicit package
 *   node scripts/screenshot.mjs http://localhost:4321    # screenshot arbitrary URL (no server started)
 *   node scripts/screenshot.mjs --full                   # full-page screenshot
 *   node scripts/screenshot.mjs --width=1440 --height=900
 *
 * Output: screenshots saved to .screenshots/ in the repo root.
 */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUT_DIR = resolve(ROOT, ".screenshots");

// Known packages and their dev server ports
const PACKAGES = {
  "@kioskkit/landing": { dir: "packages/landing", port: 4321 },
  "@kioskkit/web-client": { dir: "packages/web-client", port: 5173 },
  "@kioskkit/kiosk-client": { dir: "packages/kiosk-client", port: 5174 },
  "@kioskkit/web-admin": { dir: "packages/web-admin", port: 5175 },
};

function parseArgs(args) {
  const opts = {
    target: "@kioskkit/landing",
    full: false,
    width: 1280,
    height: 800,
  };

  for (const arg of args) {
    if (arg === "--full") {
      opts.full = true;
    } else if (arg.startsWith("--width=")) {
      opts.width = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--height=")) {
      opts.height = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("http")) {
      opts.target = arg;
    } else if (!arg.startsWith("--")) {
      opts.target = arg;
    }
  }

  return opts;
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let url;
  let serverProcess = null;

  if (opts.target.startsWith("http")) {
    url = opts.target;
  } else {
    const pkg = PACKAGES[opts.target];
    if (!pkg) {
      console.error(`Unknown package: ${opts.target}`);
      console.error(`Known packages: ${Object.keys(PACKAGES).join(", ")}`);
      process.exit(1);
    }

    url = `http://localhost:${pkg.port}`;

    // Check if already running
    let alreadyRunning = false;
    try {
      const res = await fetch(url);
      if (res.ok) alreadyRunning = true;
    } catch {}

    if (!alreadyRunning) {
      console.log(`Starting dev server for ${opts.target}...`);
      serverProcess = spawn(
        "pnpm",
        ["--filter", opts.target, "dev"],
        { cwd: ROOT, stdio: "ignore", detached: true }
      );
      await waitForServer(url);
      console.log("Server ready.");
    }
  }

  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: opts.width, height: opts.height },
  });

  await page.goto(url, { waitUntil: "networkidle" });

  // Viewport screenshot
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const vpPath = resolve(OUT_DIR, `viewport-${ts}.png`);
  await page.screenshot({ path: vpPath });
  console.log(`Viewport: ${vpPath}`);

  // Full page screenshot
  if (opts.full) {
    const fpPath = resolve(OUT_DIR, `full-${ts}.png`);
    await page.screenshot({ path: fpPath, fullPage: true });
    console.log(`Full page: ${fpPath}`);
  }

  await browser.close();

  if (serverProcess) {
    process.kill(-serverProcess.pid, "SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
