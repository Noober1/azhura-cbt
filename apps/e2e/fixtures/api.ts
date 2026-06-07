/** Lightweight API helpers for test setup (login, start session). */

const API = () => process.env.E2E_API_URL ?? "http://localhost:3000/api";

export interface LoginResponse {
  token: string;
  user: { id: string; nis: string; name: string; role: string; groupId: string | null };
}

export async function apiLogin(nis: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nis, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[e2e] apiLogin(${nis}) failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<LoginResponse>;
}

/** Start a session using an already-obtained JWT (avoids a second login call). */
export async function apiStartSessionWithToken(
  examId: string,
  jwt: string,
  examToken?: string
): Promise<void> {
  const res = await fetch(`${API()}/exams/${examId}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: examToken !== undefined ? JSON.stringify({ token: examToken }) : JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[e2e] apiStartSession(${examId}) failed ${res.status}: ${text}`);
  }
}

/** @deprecated Use apiStartSessionWithToken to avoid a redundant login call. */
export async function apiStartSession(
  credentials: { nis: string; password: string },
  examId: string,
  token?: string
): Promise<void> {
  const { token: jwt } = await apiLogin(credentials.nis, credentials.password);
  await apiStartSessionWithToken(examId, jwt, token);
}

export interface SessionResponse {
  id: string;
  examId: string;
  userId: string;
  examTitle: string;
  totalQuestions: number;
  startTime: number;
  endTime: number;
}

/** Creates a session and returns the created session (incl. its id). */
export async function apiCreateSession(
  examId: string,
  jwt: string,
  examToken?: string
): Promise<SessionResponse> {
  const res = await fetch(`${API()}/exams/${examId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: examToken !== undefined ? JSON.stringify({ token: examToken }) : JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[e2e] apiCreateSession(${examId}) failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<SessionResponse>;
}

/** Final-submits a session (defaults to no answers — graded as all-empty). */
export async function apiSubmitExam(
  examId: string,
  sessionId: string,
  jwt: string,
  answers: { questionId: string; selectedOptionId: string | null; timestamp: number; isFlagged?: boolean }[] = []
): Promise<void> {
  const res = await fetch(`${API()}/exams/${examId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ sessionId, answers }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[e2e] apiSubmitExam(${examId}) failed ${res.status}: ${text}`);
  }
}

export interface AdminSessionRow {
  id: string;
  userId: string;
  name: string;
  nis: string;
  groupName: string | null;
  startTime: number;
  endTime: number;
  status: "in_progress" | "completed" | "expired";
}

/** Admin: lists all participant sessions for an exam. */
export async function apiAdminListSessions(
  examId: string,
  adminJwt: string
): Promise<AdminSessionRow[]> {
  const res = await fetch(`${API()}/admin/exams/${examId}/sessions`, {
    headers: { Authorization: `Bearer ${adminJwt}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[e2e] apiAdminListSessions(${examId}) failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<AdminSessionRow[]>;
}

/**
 * Admin: resets a submitted session back to in-progress. Returns the raw HTTP
 * status so callers can assert both success (200) and the multi-session guard
 * rejection (409) without the helper throwing.
 */
export async function apiResetSession(
  sessionId: string,
  adminJwt: string
): Promise<{ status: number; ok: boolean }> {
  const res = await fetch(`${API()}/admin/sessions/${sessionId}/reset`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminJwt}` },
  });
  return { status: res.status, ok: res.ok };
}
