import { defineConfig } from "vitest/config";

/**
 * Minimal Vitest setup for the console app (#130). Mirrors the student app's
 * harness: pure logic + api-clients in a Node environment — no jsdom, no
 * @testing-library. React hooks/components are covered by the E2E suite
 * (see CLAUDE.md), so this exists for the side-effect-free helpers (formatters,
 * JWT decode, print-HTML builders) and the typed axios api-clients (mocked).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
