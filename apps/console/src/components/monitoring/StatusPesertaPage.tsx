/**
 * Azhura CBT Console — Status Peserta (live participant monitoring, #7).
 *
 * Shows every logged-in student, grouped into sections:
 * - **Dashboard** — idle students (logged in, not in an exam). Each has a remote
 *   logout button, plus a "Logout semua" action, for students who forgot to sign
 *   out. The server refuses to logout anyone mid-exam.
 * - **One section per exam** — students actively working, with a live connection
 *   status, remaining-time countdown, and proctor actions: **Selesaikan**
 *   (remote finish, #12) and **Keluarkan** (kick = submit + logout, #11).
 *
 * Backfilled over HTTP then kept live by `roster-update` socket patches via
 * {@link useRoster}. Available to supervisors and admins.
 */

import { useMemo, useState } from "react";
import type { AntiCheatViolation, RosterConnection, RosterParticipant } from "@azhura/shared";
import { useRoster } from "./useRoster";
import { useAntiCheatFeed } from "./useAntiCheatFeed";
import { monitoringApi } from "../../lib/monitoring-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Spinner, CenterState } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ReasonDialog } from "../ui/ReasonDialog";
import { BroadcastDialog } from "./BroadcastDialog";
import { TimeChangeDialog } from "./TimeChangeDialog";
import { PageHelpButton } from "../ui/PageHelpButton";
import { ActivityIcon, LogOutIcon, CheckIcon, XIcon, AlertIcon, ClockIcon } from "../ui/icons";

/** A pending proctor action on an exam-taker, awaiting reason + confirmation. */
type PendingAction = { kind: "kick" | "finish"; participant: RosterParticipant };

/** Formats a remaining-time duration (ms) as H:MM:SS / M:SS, floored at 0. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const CONNECTION_LABEL: Record<RosterConnection, string> = {
  connected: "Online",
  disconnected: "Terputus",
  pending: "Menyambung",
};

function ConnectionBadge({ connection }: { connection: RosterConnection }) {
  const tone =
    connection === "connected" ? "positive" : connection === "pending" ? "warn" : "danger";
  // Bordered state dot inside the pill; online keeps its subtle pulse.
  const dot =
    connection === "connected"
      ? "bg-positive animate-pulse"
      : connection === "pending"
        ? "bg-warn"
        : "bg-danger";
  return (
    <Badge tone={tone}>
      <span
        className={`size-2 rounded-full border border-[var(--nb-ink)] ${dot}`}
        aria-hidden="true"
      />
      {CONNECTION_LABEL[connection]}
    </Badge>
  );
}

function RemainingTime({
  endTime,
  pausedAt,
  remainingMs,
}: {
  endTime: number;
  pausedAt: number | null;
  remainingMs: (e: number, p: number | null) => number;
}) {
  const ms = remainingMs(endTime, pausedAt);
  const isPaused = pausedAt !== null;
  const urgent = !isPaused && ms > 0 && ms <= 5 * 60 * 1000;
  const expired = ms <= 0;
  return (
    <span className={`tabular font-bold ${expired ? "text-faint" : urgent ? "animate-pulse text-danger" : "text-ink"}`}>
      {expired ? "Habis" : isPaused ? `⏸ ${formatRemaining(ms)}` : formatRemaining(ms)}
    </span>
  );
}

/** Human-readable Indonesian labels for each anti-cheat event type (#126). */
const VIOLATION_LABEL: Record<AntiCheatViolation["eventType"], string> = {
  focus_loss: "Pindah fokus",
  fullscreen_exit: "Keluar layar penuh",
  shortcut_attempt: "Pintasan keyboard",
  multi_monitor: "Monitor ganda",
  clipboard_blocked: "Clipboard diblokir",
  force_refocus: "Fokus dipaksa",
  window_close_blocked: "Tutup jendela diblokir",
  os_shortcut_blocked: "Pintasan OS diblokir",
};

/** A small red pill showing a participant's live anti-cheat violation count. */
function ViolationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span title={`${count} pelanggaran anti-cheat terdeteksi`}>
      <Badge tone="danger">
        <AlertIcon className="size-3" aria-hidden="true" />
        {count}
      </Badge>
    </span>
  );
}

function IdentityCells({ p, violationCount }: { p: RosterParticipant; violationCount: number }) {
  return (
    <>
      <td className="px-4 py-3 font-medium text-ink">
        <span className="flex items-center gap-2">
          {p.name}
          <ViolationBadge count={violationCount} />
        </span>
      </td>
      <td className="tabular px-4 py-3 text-ink-soft">{p.nis}</td>
      <td className="hidden px-4 py-3 md:table-cell">
        {p.groupName ? <Badge tone="accent">{p.groupName}</Badge> : <span className="text-faint">—</span>}
      </td>
      <td className="px-4 py-3">
        <ConnectionBadge connection={p.connection} />
      </td>
    </>
  );
}

/** Formats a violation timestamp as HH:MM:SS for the compact feed. */
function formatViolationTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function SectionHeader({ title, count, action }: { title: string; count: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-extrabold text-ink">{title}</h2>
        <span className="tabular rounded-full border-2 border-[var(--nb-ink)] bg-highlight px-2 py-0.5 text-xs font-bold text-ink">{count}</span>
      </div>
      {action}
    </div>
  );
}

export function StatusPesertaPage() {
  const { participants, loading, error, wsConnected, reload, remainingMs } = useRoster();
  // Live anti-cheat feed (#126): per-student counts drive the row badges and the
  // newest events feed the compact panel below the roster.
  const { violations, byStudent, clear: clearViolations } = useAntiCheatFeed(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  // Time change (#8): null = closed; "picker" = page-level dialog with the full
  // target picker; a participant = per-row dialog locked to that exam-taker.
  const [timeChange, setTimeChange] = useState<"picker" | RosterParticipant | null>(null);

  const { dashboard, examSections } = useMemo(() => {
    const dash: RosterParticipant[] = [];
    const byExam = new Map<string, RosterParticipant[]>();
    for (const p of participants) {
      if (!p.exam) {
        dash.push(p);
      } else {
        const list = byExam.get(p.exam.examTitle) ?? [];
        list.push(p);
        byExam.set(p.exam.examTitle, list);
      }
    }
    return {
      dashboard: dash,
      examSections: [...byExam.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [participants]);

  const setBusy = (userId: string, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    });

  async function logoutOne(p: RosterParticipant) {
    setBusy(p.userId, true);
    try {
      await monitoringApi.logoutDashboard(p.userId);
      toast.success(`${p.name} dikeluarkan dari dashboard.`);
      // The row disappears live via the `roster-update` remove patch.
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mengeluarkan peserta."));
    } finally {
      setBusy(p.userId, false);
    }
  }

  async function logoutAllDashboard() {
    // ConfirmDialog owns the busy state and closes on success; rethrow on error
    // so it stays open while the toast explains why.
    try {
      const count = await monitoringApi.logoutDashboard();
      toast.success(`${count} peserta dikeluarkan dari dashboard.`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mengeluarkan peserta dashboard."));
      throw err;
    }
  }

  // Runs the confirmed exam-taker action. ReasonDialog owns busy/close and
  // rethrows on error so it stays open while the toast explains why. The row
  // updates live via `roster-update` (kick → remove; finish → student submits
  // then disconnects → remove).
  async function runPendingAction(reason: string) {
    if (!pendingAction) return;
    const { kind, participant } = pendingAction;
    try {
      if (kind === "kick") {
        await monitoringApi.kickStudent(participant.userId, reason);
        toast.success(`${participant.name} dikeluarkan dari ujian.`);
      } else {
        await monitoringApi.forceSubmit(participant.userId, reason);
        toast.success(`Ujian ${participant.name} diselesaikan.`);
      }
    } catch (err) {
      toast.error(
        getErrorMessage(
          err,
          kind === "kick" ? "Gagal mengeluarkan peserta." : "Gagal menyelesaikan ujian peserta."
        )
      );
      throw err;
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Status Peserta</h1>
          <p className="mt-1 text-sm text-faint">
            {participants.length > 0
              ? `${participants.length} peserta online`
              : "Pemantauan peserta ujian secara realtime"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 text-xs font-medium text-faint"
            title={wsConnected ? "Terhubung ke server realtime" : "Koneksi realtime terputus"}
          >
            <span className={`size-2 rounded-full ${wsConnected ? "bg-positive" : "bg-danger"}`} aria-hidden="true" />
            {wsConnected ? "Realtime aktif" : "Realtime terputus"}
          </span>
          <PageHelpButton topic="monitoring" />
          {/* Divider separates the help affordance from the proctor actions. */}
          <span className="h-6 w-px bg-line-soft" aria-hidden="true" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTimeChange("picker")}
            leadingIcon={<ClockIcon className="size-4" />}
          >
            Ubah Waktu
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setBroadcastOpen(true)}
            leadingIcon={<AlertIcon className="size-4" />}
          >
            Kirim Pesan
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)]">
          <CenterState>
            <Spinner className="size-6 text-accent" />
            <span>Memuat daftar peserta…</span>
          </CenterState>
        </div>
      ) : error ? (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)]">
          <CenterState>
            <span className="text-danger">{error}</span>
            <Button variant="secondary" size="sm" onClick={reload}>
              Coba lagi
            </Button>
          </CenterState>
        </div>
      ) : participants.length === 0 ? (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)]">
          <CenterState>
            <span className="grid size-12 place-items-center rounded-full bg-canvas text-faint">
              <ActivityIcon className="size-6" />
            </span>
            <span>Belum ada peserta yang sedang online.</span>
          </CenterState>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {/* Dashboard (idle) section */}
          {dashboard.length > 0 && (
            <section className="overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)]">
              <SectionHeader
                title="Dashboard"
                count={dashboard.length}
                action={
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmBulk(true)}
                    leadingIcon={<LogOutIcon className="size-4" />}
                  >
                    Logout semua
                  </Button>
                }
              />
              <table className="w-full border-t border-line text-sm">
                <thead>
                  <tr className="border-b-[2.5px] border-[var(--nb-ink)] bg-highlight text-left text-xs font-extrabold uppercase tracking-wider text-ink">
                    <th className="px-4 py-2.5">Nama</th>
                    <th className="px-4 py-2.5">NIS</th>
                    <th className="hidden px-4 py-2.5 md:table-cell">Group</th>
                    <th className="px-4 py-2.5">Koneksi</th>
                    <th className="px-4 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.map((p) => (
                    <tr key={p.userId} className="border-b-[1.5px] border-line-soft transition-colors last:border-0 hover:bg-canvas">
                      <IdentityCells p={p} violationCount={byStudent.get(p.userId) ?? 0} />
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          busy={busyIds.has(p.userId)}
                          onClick={() => logoutOne(p)}
                          leadingIcon={<LogOutIcon className="size-4" />}
                        >
                          Logout
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* One section per exam */}
          {examSections.map(([title, rows]) => (
            <section key={title} className="overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)]">
              <SectionHeader title={title} count={rows.length} />
              <table className="w-full border-t border-line text-sm">
                <thead>
                  <tr className="border-b-[2.5px] border-[var(--nb-ink)] bg-highlight text-left text-xs font-extrabold uppercase tracking-wider text-ink">
                    <th className="px-4 py-2.5">Nama</th>
                    <th className="px-4 py-2.5">NIS</th>
                    <th className="hidden px-4 py-2.5 md:table-cell">Group</th>
                    <th className="px-4 py-2.5">Koneksi</th>
                    <th className="px-4 py-2.5">Sisa waktu</th>
                    <th className="px-4 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.userId} className="border-b-[1.5px] border-line-soft transition-colors last:border-0 hover:bg-canvas">
                      <IdentityCells p={p} violationCount={byStudent.get(p.userId) ?? 0} />
                      <td className="px-4 py-3">
                        {p.exam && (
                          <RemainingTime
                            endTime={p.exam.endTime}
                            pausedAt={p.exam.pausedAt}
                            remainingMs={remainingMs}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTimeChange(p)}
                            leadingIcon={<ClockIcon className="size-4" />}
                          >
                            Ubah waktu
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingAction({ kind: "finish", participant: p })}
                            leadingIcon={<CheckIcon className="size-4" />}
                          >
                            Selesaikan
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10 hover:text-danger"
                            onClick={() => setPendingAction({ kind: "kick", participant: p })}
                            leadingIcon={<XIcon className="size-4" />}
                          >
                            Keluarkan
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      {/* Anti-cheat live feed (#126): a compact, newest-first list of detected
          violations across all participants, with a clear action. Hidden until
          the first violation arrives so it doesn't clutter a clean exam. */}
      {violations.length > 0 && (
        <section className="mt-5 overflow-hidden rounded-[var(--radius-card)] border-[2.5px] border-[var(--nb-ink)] bg-surface shadow-[3px_3px_0_var(--nb-ink)]">
          <SectionHeader
            title="Aktivitas anti-cheat"
            count={violations.length}
            action={
              <Button variant="ghost" size="sm" onClick={clearViolations}>
                Bersihkan
              </Button>
            }
          />
          <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto border-t border-line text-sm">
            {violations.map((v) => (
              <li
                key={`${v.studentId}-${v.timestamp}-${v.eventType}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <AlertIcon className="size-4 shrink-0 text-danger" aria-hidden="true" />
                  <span className="truncate font-medium text-ink">{v.name || v.nis}</span>
                  <span className="text-faint">·</span>
                  <span className="truncate text-ink-soft">{VIOLATION_LABEL[v.eventType]}</span>
                </div>
                <span className="tabular shrink-0 text-xs text-faint">
                  {formatViolationTime(v.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={confirmBulk}
        title="Logout semua peserta di Dashboard?"
        message={`${dashboard.length} peserta yang sedang berada di dashboard (tidak sedang ujian) akan dikeluarkan dan harus login kembali. Peserta yang sedang mengerjakan ujian tidak terpengaruh.`}
        confirmLabel="Logout semua"
        tone="danger"
        onConfirm={logoutAllDashboard}
        onClose={() => setConfirmBulk(false)}
      />

      <ReasonDialog
        open={pendingAction !== null}
        title={
          pendingAction?.kind === "kick"
            ? `Keluarkan ${pendingAction.participant.name} dari ujian?`
            : `Selesaikan ujian ${pendingAction?.participant.name ?? ""}?`
        }
        message={
          pendingAction?.kind === "kick"
            ? "Ujian peserta akan dikumpulkan & dinilai otomatis, lalu peserta dikeluarkan paksa (logout). Akun bisa login kembali sesuai aturan."
            : "Ujian peserta akan dikumpulkan & dinilai otomatis, lalu peserta diarahkan ke halaman hasil. Peserta tetap login."
        }
        confirmLabel={pendingAction?.kind === "kick" ? "Keluarkan" : "Selesaikan"}
        tone={pendingAction?.kind === "kick" ? "danger" : "primary"}
        onConfirm={runPendingAction}
        onClose={() => setPendingAction(null)}
      />

      <BroadcastDialog
        open={broadcastOpen}
        participants={participants}
        onClose={() => setBroadcastOpen(false)}
      />

      <TimeChangeDialog
        open={timeChange !== null}
        fixedParticipant={timeChange === "picker" ? null : timeChange}
        participants={participants}
        onClose={() => setTimeChange(null)}
      />
    </div>
  );
}
