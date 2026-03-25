import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const kioskAdminDevUrl = process.env.KIOSK_ADMIN_DEV_URL;

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
      "/admin": {
        target: kioskAdminDevUrl ?? "http://localhost:5176",
      },
      "/api": "http://localhost:3002",
    },
  },
});
