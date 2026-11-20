import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const coiHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: coiHeaders,
    // The VM image and the 45 MB overlay are static blobs. Watching them
    // makes the dev server full-reload the page while the iframe is booting,
    // which looks exactly like a hung guest agent.
    watch: {
      ignored: ["**/public/vm/**", "**/public/overlays/**"],
    },
  },
  preview: {
    headers: coiHeaders,
  },
});
