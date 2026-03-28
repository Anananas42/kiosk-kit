import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/pairing.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
});
