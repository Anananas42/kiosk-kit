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
      ...(kioskAdminDevUrl
        ? {
            "^/api/devices/.+/kiosk/admin": {
              target: kioskAdminDevUrl,
              rewrite: (p: string) => p.replace(/^\/api\/devices\/.+\/kiosk\/admin/, "/admin"),
            },
            "/admin": {
              target: kioskAdminDevUrl,
            },
          }
        : {}),
      "/api": "http://localhost:3002",
    },
  },
});
