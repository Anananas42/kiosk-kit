import { cpSync, mkdirSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  // Don't bundle node_modules — they're available at runtime
  noExternal: ["@kioskkit/shared"],
  onSuccess: async () => {
    // Copy SQL migration files to dist so they're available at runtime
    mkdirSync("dist/db/migrations", { recursive: true });
    cpSync("src/db/migrations", "dist/db/migrations", { recursive: true });
  },
});
