import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { LoginForm } from "../components/auth/LoginForm";
import { AuthLayout } from "../components/layout/AuthLayout";
import { DashboardPage } from "../components/dashboard/DashboardPage";
import { ExamLayout } from "../components/exam/ExamLayout";
import { ResultPage } from "../components/exam/ResultPage";
import { SetupWizard } from "../components/setup/SetupWizard";

/**
 * Redirects to /setup when the server URL has not been configured yet.
 * Wraps all routes that require a working backend connection.
 */
const SetupGuard = ({ children }: { children: React.ReactNode }) => {
  const { isSetupComplete } = useConfigStore();
  if (!isSetupComplete) return <Navigate to="/setup" replace />;
  return <>{children}</>;
};

/** Wraps protected routes, redirecting to `/login` when unauthenticated. */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export const AppRouter = () => {
  const navigate = useNavigate();

  return (
    <Routes>
      {/* Public: First-run setup wizard (shown when serverUrl is not configured) */}
      <Route
        path="/setup"
        element={<SetupWizard onComplete={() => navigate("/login")} />}
      />

      {/* Public: Login */}
      <Route
        path="/login"
        element={
          <SetupGuard>
            <AuthLayout>
              <LoginForm onSuccess={() => navigate("/dashboard")} />
            </AuthLayout>
          </SetupGuard>
        }
      />

      {/* Protected: Dashboard */}
      <Route
        path="/dashboard"
        element={
          <SetupGuard>
            <ProtectedRoute>
              <DashboardPage
                onExamStarted={() => navigate("/exam")}
                onShowResult={() => navigate("/result")}
              />
            </ProtectedRoute>
          </SetupGuard>
        }
      />

      {/* Protected: Exam Page */}
      <Route
        path="/exam"
        element={
          <SetupGuard>
            <ProtectedRoute>
              <ExamLayout onExamSubmitted={() => navigate("/result")} />
            </ProtectedRoute>
          </SetupGuard>
        }
      />

      {/* Protected: Results Page */}
      <Route
        path="/result"
        element={
          <SetupGuard>
            <ProtectedRoute>
              <ResultPage onFinish={() => navigate("/dashboard")} />
            </ProtectedRoute>
          </SetupGuard>
        }
      />

      {/* Default Fallback Redirect */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

/** Top-level export: mounts the router inside a HashRouter (Tauri-friendly). */
export const AppRouterWrapper = () => (
  <HashRouter>
    <AppRouter />
  </HashRouter>
);
export default AppRouterWrapper;
