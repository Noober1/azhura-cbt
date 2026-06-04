/**
 * Azhura CBT Console — Broadcast dialog (#13).
 *
 * Lets a supervisor send a message to a target — everyone, one or more groups, or
 * a single online student — displayed on the student client as a toast or a
 * (lightly blocking) modal. Built on {@link Modal}; busy/close + rethrow-on-error
 * follows the {@link ReasonDialog}/{@link ConfirmDialog} pattern.
 */

import { useEffect, useState } from "react";
import type {
  BroadcastTarget,
  GroupOption,
  RosterParticipant,
  SupervisorMessageVariant,
} from "@azhura/shared";
import { monitoringApi } from "../../lib/monitoring-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, Textarea, Checkbox } from "../ui/Field";
import { Select } from "../ui/Select";

type TargetType = BroadcastTarget["type"];

const TARGET_LABEL: Record<TargetType, string> = {
  all: "Semua siswa",
  group: "Group",
  user: "Siswa tertentu",
};

const VARIANT_LABEL: Record<SupervisorMessageVariant, string> = {
  toast: "Toast",
  modal: "Modal",
};

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

interface BroadcastDialogProps {
  open: boolean;
  /** Currently-online participants, for the "siswa tertentu" picker. */
  participants: RosterParticipant[];
  onClose: () => void;
}

export function BroadcastDialog({ open, participants, onClose }: BroadcastDialogProps) {
  const [targetType, setTargetType] = useState<TargetType>("all");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [variant, setVariant] = useState<SupervisorMessageVariant>("toast");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // Reset the form and (lazily) load groups whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTargetType("all");
    setGroupIds([]);
    setUserId("");
    setVariant("toast");
    setMessage("");
    setGroupsLoading(true);
    monitoringApi
      .listGroups()
      .then(setGroups)
      .catch((err) => toast.error(getErrorMessage(err, "Gagal memuat daftar group.")))
      .finally(() => setGroupsLoading(false));
  }, [open]);

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  const trimmed = message.trim();
  const targetReady =
    targetType === "all" ||
    (targetType === "group" && groupIds.length > 0) ||
    (targetType === "user" && userId !== "");
  const canSend = trimmed.length > 0 && targetReady && !busy;

  function buildTarget(): BroadcastTarget {
    if (targetType === "user") return { type: "user", userId };
    if (targetType === "group") return { type: "group", groupIds };
    return { type: "all" };
  }

  async function handleSend() {
    setBusy(true);
    try {
      await monitoringApi.sendMessage({ message: trimmed, variant, target: buildTarget() });
      toast.success("Pesan terkirim.");
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal mengirim pesan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Kirim Pesan ke Peserta"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" busy={busy} disabled={!canSend} onClick={handleSend}>
            Kirim
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
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
                  {participants.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.name} ({p.nis})
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
        </Field>

        <Field label="Tampilan" hint="Toast: notifikasi ringan. Modal: dialog yang harus ditutup siswa.">
          {() => (
            <Segmented
              value={variant}
              onChange={setVariant}
              options={(["toast", "modal"] as SupervisorMessageVariant[]).map((v) => ({
                value: v,
                label: VARIANT_LABEL[v],
              }))}
            />
          )}
        </Field>

        <Field label="Pesan" required>
          {(id) => (
            <Textarea
              id={id}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tulis pesan untuk peserta…"
              disabled={busy}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
