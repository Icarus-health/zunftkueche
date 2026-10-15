import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startApplication, usesMicrosoft } from "./bootstrap/start.ts";
import { showBootstrapScreen } from "./bootstrap/screen.ts";
import "./styles.css";
const root = document.getElementById("root")!;
const microsoft = usesMicrosoft(import.meta.env.DEV, import.meta.env.MODE);
if (microsoft) showBootstrapScreen(root);
void startApplication(microsoft, {
  connectMicrosoft: async () => {
    const { connectMicrosoft } = await import("./bootstrap/microsoft.ts");
    await connectMicrosoft();
  },
  mount: async () => {
    const { default: App } = await import("./App.tsx");
    createRoot(root).render(<StrictMode><App /></StrictMode>);
  },
  showError: () => showBootstrapScreen(root, true),
});
