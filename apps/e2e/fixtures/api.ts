/** Lightweight API helpers for test setup (login, start session). */

const API = () => process.env.E2E_API_URL ?? "http://localhost:3000/api";

interface LoginResponse {
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

export async function apiStartSession(
  credentials: { nis: string; password: string },
  examId: string,
  token?: string
): Promise<void> {
  const { token: jwt } = await apiLogin(credentials.nis, credentials.password);
  const res = await fetch(`${API()}/exams/${examId}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: token !== undefined ? JSON.stringify({ token }) : JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[e2e] apiStartSession(${examId}) failed ${res.status}: ${text}`);
  }
}
