/**
 * Azhura CBT Console — Time change dialog (#8).
 *
 * Lets a supervisor add or subtract remaining exam time for a target. Opened in
 * two modes:
 * - **fixed** — a single exam-taker (per-row "Ubah waktu"); the target is locked
 *   and only the amount is chosen.
 * - **picker** — a page-level action with the full target picker (everyone, one
 *   or more groups, or a single online student), mirroring {@link BroadcastDialog}.
 *
 * Built on {@link Modal}; busy/close + rethrow-on-error follows the
 * {@link ReasonDialog}/{@link BroadcastDialog} pattern. Affected students' rows
 * update live via the `roster-update` patch the server emits after applying.
 */

import { useEffect, useState } from "react";
import type { BroadcastTarget, GroupOption, RosterParticipant } from "@azhura/shared";
import { monitoringApi } from "../../lib/monitoring-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, Input, Checkbox } from "../ui/Field";
import { Select } from "../ui/Select";

type TargetType = BroadcastTarget["type"];
type Direction = "add" | "subtract";

const TARGET_LABEL: Record<TargetType, string> = {
  all: "Semua peserta ujian",
  group: "Group",
  user: "Siswa tertentu",
};

/** Quick-pick amounts (minutes) offered as buttons. */
const PRESETS = [1, 5, 10, 15] as const;

/** A small segmented selector (mutually-exclusive choices). */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-field)] border border-line bg-canvas p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`focus-ring rounded-[calc(var(--radius-field)-2px)] px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
            value === opt.value ? "bg-surface text-ink shadow-sm" : "text-faint hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface TimeChangeDialogProps {
  open: boolean;
  /**
   * When set, the target is fixed to this participant (per-row mode) and the
   * picker is hidden. When omitted, the dialog shows the all/group/user picker.
   */
  fixedParticipant?: RosterParticipant | null;
  /** Online participants for the "siswa tertentu" picker (picker mode only). */
  participants: RosterParticipant[];
  onClose: () => void;
}

export function TimeChangeDialog({
  open,
  fixedParticipant,
  participants,
  onClose,
}: TimeChangeDialogProps) {
  const fixed = Boolean(fixedParticipant);

  const [targetType, setTargetType] = useState<TargetType>("all");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [direction, setDirection] = useState<Direction>("add");
  const [minutes, setMinutes] = useState<string>("5");
  const [busy, setBusy] = useState(false);

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // Reset the form whenever the dialog opens; lazily load groups only in picker mode.
  useEffect(() => {
    if (!open) return;
    setTargetType("all");
    setGroupIds([]);
    setUserId("");
    setDirection("add");
    setMinutes("5");
    if (fixed) return;
    setGroupsLoading(true);
    monitoringApi
      .listGroups()
      .then(setGroups)
      .catch((err) => toast.error(getErrorMessage(err, "Gagal memuat daftar group.")))
      .finally(() => setGroupsLoading(false));
  }, [open, fixed]);

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  const amount = Number(minutes);
  const amountValid = Number.isFinite(amount) && amount > 0;
  const targetReady =
    fixed ||
    targetType === "all" ||
    (targetType === "group" && groupIds.length > 0) ||
    (targetType === "user" && userId !== "");
  const canApply = amountValid && targetReady && !busy;

  function buildTarget(): BroadcastTarget {
    if (fixedParticipant) return { type: "user", userId: fixedParticipant.userId };
    if (targetType === "user") return { type: "user", userId };
    if (targetType === "group") return { type: "group", groupIds };
    return { type: "all" };
  }

  async function handleApply() {
    if (!amountValid) return;
    const deltaMinutes = direction === "add" ? amount : -amount;
    setBusy(true);
    try {
      const count = await monitoringApi.changeTime(buildTarget(), deltaMinutes);
      const verb = direction === "add" ? "ditambah" : "dikurangi";
      toast.success(
        count > 0
          ? `Waktu ${verb} ${amount} menit untuk ${count} peserta.`
          : "Tidak ada peserta aktif yang terpengaruh."
      );
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mengubah waktu peserta."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={
        fixedParticipant ? `Ubah waktu — ${fixedParticipant.name}` : "Ubah waktu peserta"
      }
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" busy={busy} disabled={!canApply} onClick={handleApply}>
            Terapkan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!fixed && (
          <Field label="Target" required>
            {() => (
              <div className="flex flex-col gap-3">
                <Segmented
                  value={targetType}
                  onChange={setTargetType}
                  options={(["all", "group", "user"] as TargetType[]).map((t) => ({
                    value: t,
                    label: TARGET_LABEL[t],
                  }))}
                />

                {targetType === "group" && (
                  <div className="flex flex-col gap-2">
                    {groupsLoading ? (
                      <p className="text-xs text-faint">Memuat group…</p>
                    ) : groups.length === 0 ? (
                      <p className="text-xs text-faint">Belum ada group.</p>
                    ) : (
                      groups.map((g) => (
                        <Checkbox
                          key={g.id}
                          label={g.name}
                          checked={groupIds.includes(g.id)}
                          onChange={() => toggleGroup(g.id)}
                        />
                      ))
                    )}
                  </div>
                )}

                {targetType === "user" && (
                  <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                    <option value="">— Pilih siswa online —</option>
                    {participants
                      .filter((p) => p.exam)
                      .map((p) => (
                        <option key={p.userId} value={p.userId}>
                          {p.name} ({p.nis})
                        </option>
                      ))}
                  </Select>
                )}
              </div>
            )}
          </Field>
        )}

        <Field label="Arah">
          {() => (
            <Segmented
              value={direction}
              onChange={setDirection}
              options={[
                { value: "add" as Direction, label: "Tambah waktu" },
                { value: "subtract" as Direction, label: "Kurangi waktu" },
              ]}
            />
          )}
        </Field>

        <Field
          label="Jumlah menit"
          required
          hint="Mengurangi lebih dari sisa waktu akan langsung mengakhiri ujian peserta."
        >
          {(id) => (
            <div className="flex flex-col gap-2">
              <Input
                id={id}
                type="number"
                min={1}
                max={180}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                disabled={busy}
              />
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setMinutes(String(p))}
                    className={`focus-ring rounded-[var(--radius-field)] border px-2.5 py-1 text-xs font-medium transition-colors ${
                      Number(minutes) === p
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line text-faint hover:text-ink"
                    }`}
                  >
                    {p}m
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>
      </div>
    </Modal>
  );
}
