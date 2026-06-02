import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Admin/supervisor console — plain web app (no Tauri). Runs on a separate port
// from the student dev server (1420) to allow running both side by side.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  server: {
    port: 1430,
    strictPort: true,
  },
});
