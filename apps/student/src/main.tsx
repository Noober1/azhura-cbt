/**
 * Azhura CBT App - Browser Entry Point
 *
 * Loads persisted config (serverUrl, anti-cheat settings, etc.) from the
 * Tauri plugin-store before mounting React so the app always starts with the
 * correct configuration — including whether the first-run wizard should appear.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useConfigStore } from "./stores/config";
import "./index.css";

async function bootstrap() {
  await useConfigStore.getState().initialize();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
