import AppRouterWrapper from "./routes";
import { Toaster } from "sonner";

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
    </>
  );
}

export default App;
