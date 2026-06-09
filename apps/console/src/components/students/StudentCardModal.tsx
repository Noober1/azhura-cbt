/**
 * Azhura CBT Console — Cetak Kartu Peserta modal (#22).
 *
 * Generates ISO 7810 ID-1 (85.6 mm × 54 mm) credential cards for distributing
 * login accounts to exam participants. Each card shows school name, student name,
 * username (NIS), login password (entered by admin), group, and batch.
 *
 * Passwords are stored bcrypt-hashed and never returned by the API, so the admin
 * supplies the plaintext password that was assigned to this batch. If left blank,
 * the password row is omitted from the cards.
 *
 * Data is fetched via `studentsApi.fetchAll` and opened as a blob URL in a new
 * window so the browser's native print/Save-as-PDF dialog handles output.
 */

import { useState } from "react";
import { studentsApi } from "../../lib/students-api";
import { settingsApi } from "../../lib/settings-api";
import { getErrorMessage } from "../../lib/errors";
import { toast } from "../../stores/toast";
import { buildStudentCardsPrintHtml, openPrintWindow } from "../../lib/print-utils";
import { useGroups } from "../../hooks/useGroups";
import type { GroupSummary } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { Spinner } from "../ui/Spinner";
import { PrinterIcon } from "../ui/icons";

interface Props {
  open: boolean;
  onClose: () => void;
}

const BATCH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function StudentCardModal({ open, onClose }: Props) {
  const { groups, loading: groupsLoading } = useGroups();

  const [groupId, setGroupId] = useState("");
  const [batch, setBatch] = useState("");
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    let shouldClose = false;
    try {
      const [students, settings] = await Promise.all([
        studentsApi.fetchAll({
          groupId: groupId || undefined,
          q: undefined,
        }),
        settingsApi.get(),
      ]);

      // Apply batch filter client-side (the list API doesn't filter by batch).
      const filtered = batch
        ? students.filter((s) => s.batch === Number(batch))
        : students;

      if (filtered.length === 0) {
        toast.error("Tidak ada siswa yang cocok dengan filter yang dipilih.");
        return;
      }

      const opened = openPrintWindow(
        buildStudentCardsPrintHtml(filtered, settings.schoolName)
      );
      if (!opened) {
        toast.error("Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.");
      } else {
        shouldClose = true;
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Gagal menyiapkan kartu peserta."));
    } finally {
      // setPrinting must run before onClose so we don't set state on an unmounted component.
      setPrinting(false);
    }
    if (shouldClose) onClose();
  }

  function handleClose() {
    if (printing) return;
    setGroupId("");
    setBatch("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Cetak Kartu Peserta">
      <p className="text-sm text-faint">
        Kartu berukuran ISO 7810 ID-1 (85,6 × 54 mm) berisi nama, username, password,
        grup, dan batch — untuk distribusi akun ke peserta ujian.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-faint">Group</span>
          <Select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            disabled={groupsLoading || printing}
          >
            <option value="">Semua group</option>
            {groups.map((g: GroupSummary) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-faint">Batch</span>
          <Select
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            disabled={printing}
          >
            <option value="">Semua batch</option>
            {BATCH_OPTIONS.map((b) => (
              <option key={b} value={String(b)}>
                Batch {b}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <p className="mt-3 text-xs text-faint">
        Password diambil dari data akun masing-masing siswa. Siswa yang belum memiliki
        password tersimpan tidak akan menampilkan kolom password di kartunya.
      </p>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={handleClose} disabled={printing}>
          Batal
        </Button>
        <Button
          onClick={handlePrint}
          disabled={printing}
          leadingIcon={
            printing ? <Spinner className="size-4" /> : <PrinterIcon className="size-4" />
          }
        >
          {printing ? "Menyiapkan…" : "Cetak Kartu"}
        </Button>
      </div>
    </Modal>
  );
}
