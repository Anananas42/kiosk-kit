import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/pairing.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
});
