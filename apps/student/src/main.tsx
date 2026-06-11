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
import { useAuthStore } from "./stores/auth";
import "./index.css";

async function bootstrap() {
  await useConfigStore.getState().initialize();

  // Kick off encrypted-token hydration (#129). Deliberately NOT awaited: on
  // web it resolves instantly (sync localStorage hydration already happened, so
  // `initialized` is already true and there's zero UX change). On native it
  // reads the Stronghold vault asynchronously; ProtectedRoute shows a brief
  // loader until `initialized` flips, so we mount immediately rather than
  // blocking startup on the vault unlock.
  void useAuthStore.getState().initAuth();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
