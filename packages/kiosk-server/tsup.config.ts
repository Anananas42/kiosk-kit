import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  // Don't bundle node_modules — they're available at runtime
  noExternal: ["@kioskkit/shared"],
});
