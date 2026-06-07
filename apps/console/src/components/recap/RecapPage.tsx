/**
 * Azhura CBT Console — Rekap Nilai page (#19).
 *
 * Admin reporting surface with two views: per-paket (all participants of one
 * exam + class statistics) and per-siswa (one student's exam history). Scores
 * are computed server-side; this page only reads and presents them. It is the
 * data source for the later Excel/PDF export.
 */

import { useState } from "react";
import { PerPaketTab } from "./PerPaketTab";
import { PerSiswaTab } from "./PerSiswaTab";

type Tab = "paket" | "siswa";

const TABS: { id: Tab; label: string }[] = [
  { id: "paket", label: "Per Paket" },
  { id: "siswa", label: "Per Siswa" },
];

export function RecapPage() {
  const [tab, setTab] = useState<Tab>("paket");

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Rekap Nilai</h1>
        <p className="mt-1 text-sm text-faint">
          Rekap hasil ujian per paket dan riwayat nilai per siswa.
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-6 inline-flex gap-1 rounded-[var(--radius-field)] border border-line bg-canvas p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`focus-ring rounded-[calc(var(--radius-field)-2px)] px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-surface text-ink shadow-sm"
                : "text-faint hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "paket" ? <PerPaketTab /> : <PerSiswaTab />}
      </div>
    </div>
  );
}
