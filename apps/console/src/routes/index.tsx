/**
 * Azhura CBT Console — routing.
 *
 * Public: /login. Everything else is behind <ProtectedRoute> (requires auth).
 * Admin-only routes (/exams, /students, /groups) are additionally wrapped in
 * <AdminRoute> which redirects supervisors to /monitoring. Default redirects
 * are role-aware via <DefaultRedirect>.
 */

import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuthStore } from "../stores/auth";
import { LoginPage } from "../components/auth/LoginPage";
import { AppShell } from "../components/layout/AppShell";
import { ExamListPage } from "../components/exams/ExamListPage";
import { ExamDetailPage } from "../components/exams/ExamDetailPage";
import { StudentListPage } from "../components/students/StudentListPage";
import { GroupListPage } from "../components/groups/GroupListPage";
import { StatusPesertaPage } from "../components/monitoring/StatusPesertaPage";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  if (role !== "admin") {
    return <Navigate to="/monitoring" replace />;
  }
  return <>{children}</>;
}

function DefaultRedirect() {
  const role = useAuthStore((s) => s.role);
  return <Navigate to={role === "admin" ? "/exams" : "/monitoring"} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/exams" element={<AdminRoute><ExamListPage /></AdminRoute>} />
        <Route path="/exams/:examId" element={<AdminRoute><ExamDetailPage /></AdminRoute>} />
        <Route path="/students" element={<AdminRoute><StudentListPage /></AdminRoute>} />
        <Route path="/groups" element={<AdminRoute><GroupListPage /></AdminRoute>} />
        <Route path="/monitoring" element={<StatusPesertaPage />} />
      </Route>
      <Route path="/" element={<DefaultRedirect />} />
      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  );
}
