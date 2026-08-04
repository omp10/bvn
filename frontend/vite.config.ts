import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 5173 is taken by another project on this machine; pin ours so the two
    // dev servers can run side by side.
    port: 5174,
    strictPort: true,
    // Keeps the browser on one origin, so the app needs no CORS or base-URL config.
    proxy: {
      "/api": "http://localhost:4000",
      // ws:true — without it the live socket silently falls back to polling.
      "/socket.io": { target: "http://localhost:4000", ws: true },
    },
  },
});
