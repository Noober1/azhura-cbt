/**
 * Azhura CBT App - Application Router
 *
 * Defines the HashRouter route tree (login, dashboard, exam, result) and the
 * `ProtectedRoute` guard that redirects unauthenticated users to `/login`.
 * Each page is implemented in its own feature component.
 */

import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { LoginForm } from "../components/auth/LoginForm";
import { AuthLayout } from "../components/layout/AuthLayout";
import { DashboardPage } from "../components/dashboard/DashboardPage";
import { ExamLayout } from "../components/exam/ExamLayout";
import { ResultPage } from "../components/exam/ResultPage";

/** Wraps protected routes, redirecting to `/login` when unauthenticated. */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

/** Declares the route tree and which routes require authentication. */
export const AppRouter = () => {
  const navigate = useNavigate();

  return (
    <Routes>
      {/* Public: Login */}
      <Route
        path="/login"
        element={
          <AuthLayout>
            <LoginForm onSuccess={() => navigate("/dashboard")} />
          </AuthLayout>
        }
      />

      {/* Protected: Dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage onExamStarted={() => navigate("/exam")} />
          </ProtectedRoute>
        }
      />

      {/* Protected: Exam Page */}
      <Route
        path="/exam"
        element={
          <ProtectedRoute>
            <ExamLayout onExamSubmitted={() => navigate("/result")} />
          </ProtectedRoute>
        }
      />

      {/* Protected: Results Page */}
      <Route
        path="/result"
        element={
          <ProtectedRoute>
            <ResultPage onFinish={() => navigate("/login")} />
          </ProtectedRoute>
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
