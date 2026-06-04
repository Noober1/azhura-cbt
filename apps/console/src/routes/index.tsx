/**
 * Azhura CBT Console — routing.
 *
 * Public: /login. Everything else is behind <ProtectedRoute>, which requires an
 * authenticated admin session (the auth store already enforces the admin gate at
 * login; this guards direct navigation / refresh). The shell hosts the routed
 * sections.
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
        <Route path="/exams" element={<ExamListPage />} />
        <Route path="/exams/:examId" element={<ExamDetailPage />} />
        <Route path="/students" element={<StudentListPage />} />
        <Route path="/groups" element={<GroupListPage />} />
        <Route path="/monitoring" element={<StatusPesertaPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/exams" replace />} />
      <Route path="*" element={<Navigate to="/exams" replace />} />
    </Routes>
  );
}
