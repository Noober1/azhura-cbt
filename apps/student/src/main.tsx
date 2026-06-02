/**
 * Azhura CBT App - Browser Entry Point
 *
 * Mounts the React application into the `#root` element under StrictMode.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
