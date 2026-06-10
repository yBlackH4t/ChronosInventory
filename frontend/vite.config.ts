import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,ttf}"],
      },
      manifest: false, // Tauri lida com o SO, web manifest nao e necessario
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts")) return "charts-vendor";
          if (
            id.includes("@mantine/") ||
            id.includes("@emotion/") ||
            id.includes("dayjs")
          ) {
            return "ui-vendor";
          }
          if (
            id.includes("@tanstack/") ||
            id.includes("react-router") ||
            id.includes("@tabler/")
          ) {
            return "app-vendor";
          }
          if (id.includes("@tauri-apps/")) return "tauri-vendor";
          return undefined;
        },
      },
    },
  },
});
