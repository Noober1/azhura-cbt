/**
 * Azhura CBT Backend - Environment Configuration & Validation
 *
 * Centralizes reading of environment variables and fails fast (at first access)
 * when required values are missing or insecure. This turns silent, hard-to-trace
 * misconfiguration (e.g. a missing `JWT_SECRET` falling back to a shared dev
 * default) into an explicit, immediate startup error.
 *
 * Getters are grouped so that tooling which only needs part of the config does
 * not require unrelated variables:
 * - {@link getDbConfig}    — used by the MySQL pool (and seed/migrate scripts).
 * - {@link getJwtSecret}   — used by auth routes, auth middleware, and sockets.
 * - {@link getServerConfig}— used by the HTTP/socket server bootstrap.
 *
 * Each getter is memoized, so validation runs once.
 */

import { createLogger } from "./logger";

const log = createLogger("Env");

/** Reads a required env var or throws a descriptive startup error. */
const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `[Env] Variabel lingkungan wajib "${name}" belum diset. ` +
        `Salin backend/.env.example menjadi .env lalu isi nilainya.`
    );
  }
  return value;
};

/** Reads an optional env var, returning `fallback` when unset OR set-but-empty. */
const optionalEnv = (name: string, fallback: string): string => {
  const value = process.env[name];
  // `"" ?? fallback` is "", so an empty var (e.g. `CORS_ORIGIN=`) previously
  // slipped through as an empty string instead of using the fallback.
  return value === undefined || value.trim() === "" ? fallback : value;
};

/** Parses a numeric env var, throwing if present but not a valid number. */
const numberEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`[Env] Variabel "${name}" harus berupa angka, dapat "${raw}".`);
  }
  return parsed;
};

/** Validated MySQL connection settings. */
export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

let dbConfig: DbConfig | null = null;

/**
 * Returns the validated database configuration.
 * `DB_PASSWORD` is allowed to be empty (common for local MySQL/MariaDB), but
 * host/user/name are required so a typo cannot silently connect to the wrong DB.
 */
export function getDbConfig(): DbConfig {
  if (dbConfig) return dbConfig;
  dbConfig = {
    host: requireEnv("DB_HOST"),
    port: numberEnv("DB_PORT", 3306),
    user: requireEnv("DB_USER"),
    password: optionalEnv("DB_PASSWORD", ""),
    database: requireEnv("DB_NAME"),
  };
  return dbConfig;
};

const MIN_SECRET_LENGTH = 16;

/**
 * Substrings that mark a value as an unedited placeholder from `.env.example`
 * / `.env` templates. A secret containing any of these (case-insensitive) is
 * treated as not-yet-configured.
 */
const PLACEHOLDER_SECRET_MARKERS = [
  "ganti",
  "change_me",
  "changeme",
  "fallback",
  "your_secret",
  "your-secret",
  "secret_here",
  "example",
];

let jwtSecret: string | null = null;

/**
 * Returns the validated JWT signing secret.
 *
 * Fails fast when the secret is:
 * - missing/empty, or
 * - shorter than {@link MIN_SECRET_LENGTH} characters, or
 * - an unedited template placeholder (e.g. contains "GANTI"/"change_me").
 *
 * The placeholder check is enforced in production (`NODE_ENV=production`) and
 * only warns in development, so a fresh checkout still boots locally but a real
 * deploy with template values aborts instead of running with a guessable secret.
 */
export function getJwtSecret(): string {
  if (jwtSecret) return jwtSecret;
  const secret = requireEnv("JWT_SECRET");

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[Env] "JWT_SECRET" terlalu pendek (min ${MIN_SECRET_LENGTH} karakter). ` +
        `Gunakan secret acak yang kuat.`
    );
  }

  const lower = secret.toLowerCase();
  const matchedMarker = PLACEHOLDER_SECRET_MARKERS.find((marker) =>
    lower.includes(marker)
  );
  if (matchedMarker) {
    const message =
      `[Env] "JWT_SECRET" masih berupa nilai placeholder (mengandung "${matchedMarker}"). ` +
      `Ganti dengan secret acak, mis: openssl rand -base64 32`;
    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    }
    log.warn(message);
  }

  jwtSecret = secret;
  return jwtSecret;
};

/** Validated Redis/Valkey connection settings. */
export interface RedisConfig {
  url: string;
}

let redisConfig: RedisConfig | null = null;

/**
 * Returns the validated Redis/Valkey configuration. `REDIS_URL` is optional and
 * defaults to a local instance, so a fresh checkout boots without extra setup
 * while production can point at a managed Redis/Valkey.
 */
export function getRedisConfig(): RedisConfig {
  if (redisConfig) return redisConfig;
  redisConfig = {
    url: optionalEnv("REDIS_URL", "redis://127.0.0.1:6379"),
  };
  return redisConfig;
};

let appVersion: string | null = null;

/**
 * Returns the application version shown by `GET /api/info`. Optional, defaults to
 * "1.0.0". School name/address are no longer read from env — they live in the
 * `settings` table (set during first-run setup, editable on the admin Settings
 * page) so a single source of truth feeds both the admin console and the student
 * client's connection wizard.
 */
export function getAppVersion(): string {
  if (appVersion) return appVersion;
  appVersion = optionalEnv("APP_VERSION", "1.0.0");
  return appVersion;
};

/** Test-only: clears the memoized app version so env changes take effect. */
export function _resetAppVersion(): void {
  appVersion = null;
};

/** Validated HTTP/socket server settings. */
export interface ServerConfig {
  port: number;
  corsOrigins: string[];
  /**
   * Socket.io *engine* ping/pong tuning — the transport-level liveness backstop.
   * The server pings every `pingIntervalMs`; if no pong arrives within
   * `pingTimeoutMs` the socket is considered dead and `disconnect` fires.
   */
  pingIntervalMs: number;
  pingTimeoutMs: number;
  /**
   * App-level heartbeat tuning (#9). On top of the engine ping, the server emits
   * a `heartbeat:ping` every `heartbeatPingIntervalMs` that the client's JS must
   * answer with `heartbeat:pong`. After `heartbeatMaxMisses` consecutive
   * unanswered pings the socket is force-disconnected, which flips roster status
   * (#7) and starts the session grace period (#5). Each pong refreshes the
   * session TTL/`lastSeen`, so a frozen-but-transport-alive client no longer
   * keeps its session pinned. Keep the interval safely below the connected
   * session TTL so a healthy client always refreshes in time.
   */
  heartbeatPingIntervalMs: number;
  heartbeatMaxMisses: number;
  /**
   * Whether to mount the interactive API docs (`GET /api/docs`, #177). **Off by
   * default** — this is an exam system, and exposing the full API surface plus a
   * "try it out" console widens the attack surface on a school server during a
   * live exam. Enable only in dev/non-prod by setting `ENABLE_API_DOCS=true`;
   * when false the docs route is never registered (404).
   */
  enableApiDocs: boolean;
}

let serverConfig: ServerConfig | null = null;

/** Returns validated server settings (port + CORS origins + socket ping tuning). */
export function getServerConfig(): ServerConfig {
  if (serverConfig) return serverConfig;
  const corsOrigins = optionalEnv("CORS_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  serverConfig = {
    port: numberEnv("PORT", 3000),
    corsOrigins,
    pingIntervalMs: numberEnv("SOCKET_PING_INTERVAL_MS", 25000),
    pingTimeoutMs: numberEnv("SOCKET_PING_TIMEOUT_MS", 20000),
    heartbeatPingIntervalMs: numberEnv("HEARTBEAT_PING_INTERVAL_MS", 10000),
    heartbeatMaxMisses: numberEnv("HEARTBEAT_MAX_MISSES", 2),
    enableApiDocs: optionalEnv("ENABLE_API_DOCS", "false").trim().toLowerCase() === "true",
  };
  log.debug("Server configuration loaded.", { ...serverConfig });
  return serverConfig;
};

/** Validated public-chat tuning (#17). */
export interface ChatConfig {
  /** Sliding-window length (ms) for anti-spam rate limiting. */
  windowMs: number;
  /** Max messages allowed within the window before an auto-mute triggers. */
  maxInWindow: number;
  /** Auto-mute duration (ms) once the window limit is exceeded. */
  muteMs: number;
  /** Number of recent messages sent to a client as join history. */
  historyLimit: number;
  /** Maximum message length (characters) accepted after sanitization. */
  maxLength: number;
}

let chatConfig: ChatConfig | null = null;

/**
 * Returns validated public-chat tuning. All values are optional with sane
 * defaults so a fresh checkout boots without extra configuration; the global
 * on/off switch lives in admin settings (`chatEnabled`), not here.
 */
export function getChatConfig(): ChatConfig {
  if (chatConfig) return chatConfig;
  chatConfig = {
    windowMs: numberEnv("CHAT_RATE_WINDOW_MS", 5000),
    maxInWindow: numberEnv("CHAT_RATE_MAX", 5),
    muteMs: numberEnv("CHAT_MUTE_MS", 60000),
    historyLimit: numberEnv("CHAT_HISTORY_LIMIT", 50),
    maxLength: numberEnv("CHAT_MAX_LENGTH", 500),
  };
  return chatConfig;
};
