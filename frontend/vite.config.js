import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vart /api-anropen proxas. Kan styras via env (API_TARGET) så att t.ex.
// Beelinken kan hämta data från en backend på en annan maskin.
const apiTarget = process.env.API_TARGET || "http://localhost:3000";

// Frontenden proxar API-anropen till backenden så att både dev-servern (5173)
// och kiosk-läget använder samma relativa /api-sökväg.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": apiTarget
    }
  },
  // preview-servern (produktion på Beelink) proxar också /api till backenden.
  preview: {
    host: true,
    port: 5173,
    proxy: {
      "/api": apiTarget
    }
  }
});
