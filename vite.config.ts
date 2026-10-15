import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite";
import { localKitchenApi } from "./dev/local-api.ts";
export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    ...(command === "build" || mode === "microsoft" ? [powerApps()] : []),
    ...(command === "serve" && mode !== "microsoft" ? [localKitchenApi(process.cwd())] : []),
  ],
  server: { host: "127.0.0.1", port: mode === "microsoft" ? 4182 : 4173, strictPort: true },
  build: { sourcemap: false },
}));
