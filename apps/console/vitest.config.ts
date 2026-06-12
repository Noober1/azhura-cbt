import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Vitest setup for the console app (#130). Mirrors the student app's harness:
 * pure logic + api-clients run in a Node environment by default — the
 * side-effect-free helpers (formatters, JWT decode, print-HTML builders) and
 * the typed axios api-clients (mocked).
 *
 * Component tests are the exception, not the rule: broad UI flows belong to
 * the E2E suite (see CLAUDE.md), but small self-contained widgets with a real
 * behavioural contract (e.g. the logout confirmation, #181) are unit-tested in
 * `.test.tsx` files that opt into a DOM via a per-file
 * `@vitest-environment happy-dom` docblock; everything else stays in Node.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
