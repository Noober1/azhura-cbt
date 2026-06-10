import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useDashboard } from "./useDashboard";
import { StatCard } from "./StatCard";
import { Spinner, CenterState } from "../ui/Spinner";
import { LayoutDashboardIcon } from "../ui/icons";
import type { ExamScoreSummary } from "../../types";

// ── Chart helpers ─────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${n}%`;
}

interface ChartRow {
  name: string;
  Min: number;
  Median: number;
  Max: number;
}

function toChartRows(scores: ExamScoreSummary[]): ChartRow[] {
  return scores.map((s) => ({
    name: s.examTitle.length > 20 ? `${s.examTitle.slice(0, 18)}…` : s.examTitle,
    Min: s.min,
    Median: s.median,
    Max: s.max,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { snapshot, loading, error, wsConnected } = useDashboard();

  if (loading) {
    return (
      <CenterState>
        <Spinner />
        <span>Memuat dashboard...</span>
      </CenterState>
    );
  }

  if (error || !snapshot) {
    return (
      <CenterState>
        <LayoutDashboardIcon className="size-8 text-faint" />
        <span className="font-medium text-ink">Gagal memuat dashboard</span>
        <span>{error ?? "Coba muat ulang halaman."}</span>
      </CenterState>
    );
  }

  const { stats, examScores, welcome } = snapshot;
  const chartRows = toChartRows(examScores);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">
          Selamat datang, {welcome.name}
        </h1>
        <p className="mt-1 text-sm text-faint">
          Ringkasan sistem secara realtime.
        </p>
      </div>

      {/* Stale data banner */}
      {!wsConnected && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn-wash/30 px-4 py-2.5 text-sm text-warn">
          <span className="size-2 shrink-0 rounded-full bg-warn" />
          Data mungkin tidak terkini — koneksi realtime terputus.
        </div>
      )}

      {/* Row 1: totals */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-faint">Statistik Sistem</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Peserta"  value={stats.totalStudents} />
          <StatCard label="Total Grup"     value={stats.totalGroups} />
          <StatCard label="Total Ujian"    value={stats.totalExams} />
          <StatCard
            label="Siswa Online"
            value={stats.onlineStudents}
            accent={stats.onlineStudents > 0 ? "positive" : "default"}
          />
        </div>
      </section>

      {/* Row 2: session breakdown */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-faint">Status Sesi Ujian</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Sesi Selesai"
            value={stats.sessions.completed.count}
            sub={`${pct(stats.sessions.completed.percentage)} dari peserta eligible`}
            accent="positive"
          />
          <StatCard
            label="Sesi Berlangsung"
            value={stats.sessions.inProgress.count}
            sub={`${pct(stats.sessions.inProgress.percentage)} dari peserta eligible`}
            accent="warn"
          />
          <StatCard
            label="Belum Mulai"
            value={stats.sessions.notStarted.count}
            sub={`${pct(stats.sessions.notStarted.percentage)} dari peserta eligible`}
          />
        </div>
      </section>

      {/* Row 3: exam score chart */}
      <section>
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-ink">
          Nilai per Ujian — Min / Median / Max
        </h2>
        <div className="rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface p-5 shadow-[3px_3px_0_var(--nb-ink)]">
          {chartRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-faint">
              Belum ada data ujian yang selesai.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={chartRows}
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                barCategoryGap="30%"
                barGap={3}
              >
                <CartesianGrid strokeDasharray="4 4" stroke="var(--color-line-soft, #e7dec9)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fontWeight: 700, fill: "var(--color-ink-soft, #4a463e)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fontWeight: 700, fill: "var(--color-ink-soft, #4a463e)" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "var(--radius-card, 9px)",
                    border: "2.5px solid var(--nb-ink, #15130f)",
                    boxShadow: "3px 3px 0 var(--nb-ink, #15130f)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  formatter={(value) => [`${value ?? ""}`, ""]}
                />
                <Legend
                  iconType="square"
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12, fontWeight: 700 }}
                />
                {/* 2px ink stroke on every bar — neobrutalist chart treatment. */}
                <Bar dataKey="Min"    fill="var(--color-danger, #ff5a4d)"   stroke="var(--nb-ink, #15130f)" strokeWidth={2} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Median" fill="var(--color-accent, #5b4bf5)"   stroke="var(--nb-ink, #15130f)" strokeWidth={2} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Max"    fill="var(--color-positive, #16a35a)" stroke="var(--nb-ink, #15130f)" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
