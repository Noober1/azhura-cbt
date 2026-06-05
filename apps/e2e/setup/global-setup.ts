import type { FullConfig } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Parses and injects vars from apps/e2e/.env into process.env (existing vars win). */
function loadEnvFile(): void {
  const envPath = resolve(__dirname, "../.env");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not present — env vars should be set externally (CI)
  }
}

const API = () => process.env.E2E_API_URL ?? "http://localhost:3000/api";

async function preflightBackend(): Promise<void> {
  try {
    const res = await fetch(`${API().replace("/api", "")}/health`);
    if (res.ok) return;
    throw new Error(`Health check returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `[e2e] Backend not reachable at ${API()}.\n` +
      `Start it with: bun run backend:dev\n` +
      `Ensure MySQL and Redis are running.\n` +
      `Underlying: ${(err as Error).message}`
    );
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  loadEnvFile();
  await preflightBackend();

  // Dynamic imports happen AFTER env vars are set
  const { seedE2E } = await import("./seed-e2e.ts");
  const { resetE2ESessions } = await import("./reset-e2e-sessions.ts");

  await seedE2E();
  await resetE2ESessions();
}
