import AppRouterWrapper from "./routes";
import { Toaster } from "sonner";
import { SupervisorMessageModal } from "./components/SupervisorMessageModal";

/**
 * Tauri CBT App - Main Application Entrypoint
 * Bootstraps the HashRouter and sets up global widgets like the toast container.
 */
function App() {
  return (
    <>
      {/* HashRouter Navigation structure */}
      <AppRouterWrapper />

      {/* Toast notifications container */}
      <Toaster
        position="top-right"
        expand={false}
        richColors
        theme="light"
        closeButton
      />

      {/* Supervisor broadcast modal (#13) */}
      <SupervisorMessageModal />
    </>
  );
}

export default App;
