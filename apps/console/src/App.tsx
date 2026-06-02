/**
 * Azhura CBT Console — admin + supervisor web app (role-gated).
 *
 * Scaffold only. The real console (exam management, student data, proctoring
 * dashboard) lands under the Fase 1 admin epic (#6) and Fase 4 proctoring work.
 * Imports from "@azhura/shared" to prove the workspace wiring is in place.
 */
import type { AvailableExam } from "@azhura/shared";

export function App() {
  // Touch a shared type so the workspace link is exercised at build time.
  const placeholder: AvailableExam[] = [];

  return (
    <main className="min-h-dvh grid place-items-center bg-neutral-950 text-neutral-100">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Azhura CBT — Console
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Panel admin &amp; supervisor (scaffold). {placeholder.length} ujian.
        </p>
      </div>
    </main>
  );
}
