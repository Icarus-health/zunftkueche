import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localKitchenApi } from "./dev/local-api.ts";
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === "serve" ? [localKitchenApi(process.cwd())] : []),
  ],
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: { sourcemap: false },
}));
