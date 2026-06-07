/**
 * Session reset (#58):
 *
 * 1. Realtime resume — when an admin resets a student's completed session while
 *    the student is sitting on the dashboard, the student's client is pushed the
 *    `session-reset` event and auto-redirects into /#/exam without a manual
 *    refresh.
 * 2. Multi-session guard — a completed session cannot be reset while the same
 *    participant has another in-progress session; the API rejects with 409 so
 *    the student can never end up with two concurrent live sessions.
 *
 * Logins go through the API (single login per account) to dodge the
 * anti-multi-login Redis claim; the student JWT doubles as the localStorage
 * bootstrap so the browser never logs in a second time.
 */
import { test, expect } from "../../fixtures/test.ts";
import { ExamPage } from "../../pages/ExamPage.ts";
import {
  apiLogin,
  apiCreateSession,
  apiSubmitExam,
  apiAdminListSessions,
  apiResetSession,
} from "../../fixtures/api.ts";
import { E2E_EXAM, E2E_EXAM_TOKEN, E2E_STUDENT, E2E_STUDENT_ALT, E2E_ADMIN } from "../../data/users.ts";

test.describe("Session reset (#58)", () => {
  test("admin reset → student on dashboard auto-redirects to /exam", async ({ page }) => {
    // Student: one login, used for session setup AND localStorage bootstrap.
    const { token, user } = await apiLogin(E2E_STUDENT.nis, E2E_STUDENT.password);

    // Put the student in the "already finished" state: create + submit a session.
    // A submitted session reads as status "none" on the dashboard, so the resume
    // guard leaves the student there (it only redirects for unsubmitted ones).
    const session = await apiCreateSession(E2E_EXAM.id, token);
    await apiSubmitExam(E2E_EXAM.id, session.id, token);

    await page.addInitScript(
      ({ t, u }: { t: string; u: string }) => {
        localStorage.setItem("cbt_token", t);
        localStorage.setItem("cbt_user_id", (JSON.parse(u) as { id: string }).id);
        localStorage.setItem("cbt_user", u);
      },
      { t: token, u: JSON.stringify(user) }
    );

    // Land on the dashboard and stay (submitted session → no resume redirect).
    // Capture the realtime socket so we can wait for it to actually connect — the
    // reset event is one-shot, so the student must be in their user room before
    // the admin fires it, or the redirect would never arrive.
    const wsPromise = page.waitForEvent("websocket", { timeout: 15_000 });
    await page.goto("/#/dashboard");
    await expect(page.getByRole("heading", { name: /Selamat datang/i })).toBeVisible();

    // A WebSocket means Socket.io upgraded past its initial polling connection —
    // the server-side `connection` handler already ran during that polling phase
    // and joined the user room, so the reset event will reach this client.
    await wsPromise;

    // Admin resets the student's completed session out-of-band.
    const { token: adminToken } = await apiLogin(E2E_ADMIN.nis, E2E_ADMIN.password);
    const rows = await apiAdminListSessions(E2E_EXAM.id, adminToken);
    const target = rows.find((r) => r.userId === user.id && r.status === "completed");
    expect(target, "expected a completed session for the student").toBeTruthy();

    const reset = await apiResetSession(target!.id, adminToken);
    expect(reset.status).toBe(200);

    // The realtime nudge should move the student into the exam with no refresh.
    await expect(page).toHaveURL(/#\/exam/, { timeout: 10_000 });
    await expect(new ExamPage(page).questionHeading()).toBeVisible();
  });

  test("reset rejected with 409 when participant has another active session", async ({}) => {
    // Student finishes exam A, then starts exam B (allowed: A is submitted, not
    // in-progress). B is now an active session.
    const { token, user } = await apiLogin(E2E_STUDENT_ALT.nis, E2E_STUDENT_ALT.password);

    const sessionA = await apiCreateSession(E2E_EXAM.id, token);
    await apiSubmitExam(E2E_EXAM.id, sessionA.id, token);

    await apiCreateSession(E2E_EXAM_TOKEN.id, token, E2E_EXAM_TOKEN.token);

    // Admin tries to reset the completed A while B is live → guard rejects.
    const { token: adminToken } = await apiLogin(E2E_ADMIN.nis, E2E_ADMIN.password);
    const rows = await apiAdminListSessions(E2E_EXAM.id, adminToken);
    const completed = rows.find((r) => r.userId === user.id && r.status === "completed");
    expect(completed, "expected a completed session on exam A").toBeTruthy();

    const reset = await apiResetSession(completed!.id, adminToken);
    expect(reset.status).toBe(409);
  });
});
