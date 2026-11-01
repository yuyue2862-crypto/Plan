import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    // Phone preview stays on loopback; only Cloudflare Quick Tunnel hostnames
    // may be forwarded through Vite's Host validation.
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    allowedHosts: [".trycloudflare.com"],
  },
});
