import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontenden proxar API-anropen till backenden under utveckling så att både
// dev-servern (5173) och kiosk-läget använder samma relativa /api-sökväg.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000"
    }
  },
  // preview-servern (produktion på Beelink) proxar också /api till backenden
  // så att kiosken på port 5173 når API:et på port 3000.
  preview: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000"
    }
  }
});
