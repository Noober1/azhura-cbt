/**
 * Azhura CBT Console — Tutorial dialog (#132).
 *
 * Opened from the header "?" button. Shows a short "Cara memulai" workflow
 * checklist so a new operator knows the order of work, plus a button to replay
 * the guided nav tour. Plain Indonesian, no jargon. Built on the shared
 * <Modal/>.
 */

import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { PlayIcon } from "../ui/icons";
import { replayTour } from "../../lib/tour";

interface TutorialDialogProps {
  open: boolean;
  onClose: () => void;
}

/** The recommended order of work, written for a non-technical operator. */
const WORKFLOW = [
  { title: "Buat grup", detail: "Kelompokkan peserta, misalnya per kelas (7A, 7B)." },
  { title: "Tambah peserta", detail: "Masukkan peserta satu per satu atau banyak sekaligus dari file, lalu taruh di grupnya." },
  { title: "Buat ujian & soal", detail: "Susun paket ujian beserta soalnya, lalu tugaskan ke grup peserta." },
  { title: "Tugaskan pengawas", detail: "Tentukan siapa yang akan memantau jalannya ujian." },
  { title: "Mulai monitoring", detail: "Saat ujian berlangsung, pantau peserta secara langsung." },
  { title: "Lihat rekap nilai", detail: "Setelah selesai, periksa hasil dan nilai peserta." },
] as const;

export function TutorialDialog({ open, onClose }: TutorialDialogProps) {
  function handleReplay() {
    onClose();
    // This dialog is only mounted for admins (AppShell gates it), so replay
    // the admin variant of the tour.
    replayTour("admin");
  }

  return (
    <Modal
      open={open}
      title="Cara memulai"
      description="Urutan langkah untuk menyiapkan dan menjalankan ujian."
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={handleReplay} leadingIcon={<PlayIcon className="size-4" />}>
            Putar ulang tur
          </Button>
        </>
      }
    >
      <ol className="space-y-3">
        {WORKFLOW.map((item, i) => (
          <li
            key={item.title}
            className="flex gap-3 rounded-[var(--radius-card)] border-2 border-[var(--nb-ink)] bg-canvas p-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-[var(--nb-ink)] bg-highlight text-sm font-bold text-ink">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-bold text-ink">{item.title}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{item.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-sm text-faint">
        Ingin penjelasan langsung di setiap menu? Klik "Putar ulang tur".
      </p>
    </Modal>
  );
}
