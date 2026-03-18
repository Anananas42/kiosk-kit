import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@kioskkit/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3002",
    },
  },
});
