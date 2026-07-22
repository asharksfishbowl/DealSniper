import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/deals": "http://127.0.0.1:8000",
      "/preferences": "http://127.0.0.1:8000",
      "/devices": "http://127.0.0.1:8000",
      "/refresh": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
    },
  },
});
