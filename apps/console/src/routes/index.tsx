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
import { ExamSessionsPage } from "../components/exams/ExamSessionsPage";
import { StudentListPage } from "../components/students/StudentListPage";
import { GroupListPage } from "../components/groups/GroupListPage";
import { StatusPesertaPage } from "../components/monitoring/StatusPesertaPage";
import { DashboardPage } from "../components/dashboard/DashboardPage";
import { SettingsPage } from "../components/settings/SettingsPage";
import { LogViewerPage } from "../components/logs/LogViewerPage";
import { RecapPage } from "../components/recap/RecapPage";
import { MediaGalleryPage } from "../components/media/MediaGalleryPage";
import { SupervisorExamListPage } from "../components/supervisor/SupervisorExamListPage";
import { SupervisorQuestionListPage } from "../components/supervisor/SupervisorQuestionListPage";
import { SupervisorQuestionFormPage } from "../components/supervisor/SupervisorQuestionFormPage";
import { AdminQuestionFormPage } from "../components/questions/AdminQuestionFormPage";

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
  return <Navigate to={role === "admin" ? "/dashboard" : "/monitoring"} replace />;
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
        <Route path="/dashboard" element={<AdminRoute><DashboardPage /></AdminRoute>} />
        <Route path="/exams" element={<AdminRoute><ExamListPage /></AdminRoute>} />
        <Route path="/exams/:examId" element={<AdminRoute><ExamDetailPage /></AdminRoute>} />
        <Route path="/exams/:examId/sessions" element={<AdminRoute><ExamSessionsPage /></AdminRoute>} />
        <Route path="/exams/:examId/questions/new" element={<AdminRoute><AdminQuestionFormPage /></AdminRoute>} />
        <Route path="/exams/:examId/questions/:questionId/edit" element={<AdminRoute><AdminQuestionFormPage /></AdminRoute>} />
        <Route path="/students" element={<AdminRoute><StudentListPage /></AdminRoute>} />
        <Route path="/groups" element={<AdminRoute><GroupListPage /></AdminRoute>} />
        <Route path="/media" element={<MediaGalleryPage />} />
        <Route path="/supervisor/exams" element={<SupervisorExamListPage />} />
        <Route path="/supervisor/exams/:examId/questions" element={<SupervisorQuestionListPage />} />
        <Route path="/supervisor/exams/:examId/questions/new" element={<SupervisorQuestionFormPage />} />
        <Route path="/supervisor/exams/:examId/questions/:questionId/edit" element={<SupervisorQuestionFormPage />} />
        <Route path="/monitoring" element={<StatusPesertaPage />} />
        <Route path="/recap" element={<AdminRoute><RecapPage /></AdminRoute>} />
        <Route path="/logs" element={<AdminRoute><LogViewerPage /></AdminRoute>} />
        <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
      </Route>
      <Route path="/" element={<DefaultRedirect />} />
      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  );
}
