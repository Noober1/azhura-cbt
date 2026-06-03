/**
 * Azhura CBT Console — admin + supervisor web app (role-gated).
 *
 * Root: wires the router and the global toaster. The admin area (exam & question
 * management) is the first live surface (#14); supervisor/proctoring and the
 * students/groups module (#15) land later.
 */

import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./routes";
import { Toaster } from "./components/ui/Toaster";

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster />
    </BrowserRouter>
  );
}
