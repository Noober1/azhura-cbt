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

/** Reads an optional env var, returning `fallback` when unset/empty. */
const optionalEnv = (name: string, fallback: string): string => {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? value ?? fallback : value;
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
export const getDbConfig = (): DbConfig => {
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
export const getJwtSecret = (): string => {
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
export const getRedisConfig = (): RedisConfig => {
  if (redisConfig) return redisConfig;
  redisConfig = {
    url: optionalEnv("REDIS_URL", "redis://127.0.0.1:6379"),
  };
  return redisConfig;
};

/** Validated HTTP/socket server settings. */
export interface ServerConfig {
  port: number;
  corsOrigins: string[];
  /**
   * Socket.io engine ping/pong tuning (#9 liveness foundation). The server pings
   * every `pingIntervalMs`; if no pong arrives within `pingTimeoutMs` the socket
   * is considered dead and `disconnect` fires — which drives roster connection
   * status (#7) and the session grace period (#5).
   */
  pingIntervalMs: number;
  pingTimeoutMs: number;
}

let serverConfig: ServerConfig | null = null;

/** Returns validated server settings (port + CORS origins + socket ping tuning). */
export const getServerConfig = (): ServerConfig => {
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
  };
  log.debug("Server configuration loaded.", { ...serverConfig });
  return serverConfig;
};
