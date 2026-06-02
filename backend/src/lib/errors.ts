/**
 * Azhura CBT Backend - Typed HTTP Error Classes
 *
 * These replace fragile string-matching in the global error handler. Each error
 * carries its own HTTP `status` and a client-safe `message`, so the central
 * `onError` handler can map errors to responses by *type* (`instanceof`) rather
 * than by inspecting message text — which is both safer and easier to trace.
 *
 * Throw these from routes/middleware:
 * ```ts
 * if (!session) throw new NotFoundError("Sesi ujian tidak ditemukan.");
 * ```
 */

/** Base application error carrying an HTTP status code. */
export class AppError extends Error {
  /** HTTP status code to send to the client. */
  readonly status: number;
  /** Optional machine-readable code for clients/log correlation. */
  readonly code: string;

  constructor(message: string, status = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    // Maintain a proper prototype chain when targeting ES5-ish runtimes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 — request was syntactically/semantically invalid. */
export class BadRequestError extends AppError {
  constructor(message = "Permintaan tidak valid.") {
    super(message, 400, "BAD_REQUEST");
  }
}

/** 401 — missing/invalid/expired authentication. */
export class AuthError extends AppError {
  constructor(message = "Token tidak valid atau kedaluwarsa.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/** 403 — authenticated but not allowed to perform the action. */
export class ForbiddenError extends AppError {
  constructor(message = "Akses ditolak.") {
    super(message, 403, "FORBIDDEN");
  }
}

/** 404 — the requested resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message = "Data tidak ditemukan.") {
    super(message, 404, "NOT_FOUND");
  }
}

/** 409 — request conflicts with current resource state (e.g. already submitted). */
export class ConflictError extends AppError {
  constructor(message = "Terjadi konflik dengan status data saat ini.") {
    super(message, 409, "CONFLICT");
  }
}

/** 410 — the resource is no longer available (e.g. exam time expired). */
export class GoneError extends AppError {
  constructor(message = "Sumber daya sudah tidak tersedia.") {
    super(message, 410, "GONE");
  }
}

/**
 * Extracts a safe, human-readable message from any thrown value.
 *
 * @param error The caught value (typed as `unknown`).
 * @param fallback Message used when nothing more specific can be derived.
 */
export const getErrorMessage = (
  error: unknown,
  fallback = "Terjadi kesalahan pada server."
): string => {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};
