/**
 * Azhura CBT Console — empty state daftar soal bersama (admin + supervisor).
 *
 * Kartu dashed gaya admin dengan CTA "Tambah soal pertama"; dipakai kedua
 * halaman daftar soal agar tampilannya konsisten.
 */

import { Button } from "../ui/Button";
import { CenterState } from "../ui/Spinner";
import { PlusIcon } from "../ui/icons";

interface QuestionListEmptyStateProps {
  onAdd: () => void;
  /** Mengunci CTA (admin: saat ada peserta aktif). */
  disabled?: boolean;
}

export function QuestionListEmptyState({ onAdd, disabled = false }: QuestionListEmptyStateProps) {
  return (
    <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-line bg-surface">
      <CenterState>
        <span>Tambahkan soal pertama untuk ujian ini.</span>
        <Button
          size="sm"
          onClick={onAdd}
          disabled={disabled}
          leadingIcon={<PlusIcon className="size-4" />}
        >
          Tambah soal pertama
        </Button>
      </CenterState>
    </div>
  );
}
