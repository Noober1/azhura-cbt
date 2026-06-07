/**
 * E2E-dedicated test data constants.
 * Keep in sync with setup/seed-e2e.ts — any constant added here must have a
 * matching INSERT in the seed script.
 */

export const E2E_STUDENT = {
  id: "usr_e2e_1",
  nis: "910001",
  password: "student@123",
  name: "E2E Student One",
} as const;

export const E2E_STUDENT_ALT = {
  id: "usr_e2e_2",
  nis: "910002",
  password: "student@123",
  name: "E2E Student Two",
} as const;

export const E2E_GROUP = {
  id: "grp_e2e",
  name: "E2E Kelas",
} as const;

export const E2E_EXAM = {
  id: "exam_e2e_open",
  title: "E2E Ujian Terbuka",
} as const;

export const E2E_EXAM_TOKEN = {
  id: "exam_e2e_token",
  title: "E2E Ujian Token",
  token: "AB12",
} as const;

/** Admin account for console E2E tests. */
export const E2E_ADMIN = {
  id: "usr_e2e_admin",
  nis: "900001",
  password: "admin@123",
  name: "E2E Administrator",
} as const;

/** Supervisor account for console E2E tests. */
export const E2E_SUPERVISOR = {
  id: "usr_e2e_sup",
  nis: "900002",
  password: "supervisor@123",
  name: "E2E Pengawas",
} as const;
