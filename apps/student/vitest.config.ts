import { defineConfig } from "vitest/config";

/**
 * Minimal Vitest setup for the student app (#10). Targets pure logic
 * (debounce, backoff, sync policy) in a Node environment — no jsdom, no DOM
 * deps — so unit tests stay fast and deterministic. Components/stores are
 * covered by manual E2E (see CLAUDE.md); this harness exists for the
 * side-effect-free helpers that drive autosave.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
