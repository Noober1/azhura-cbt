import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { EXAM_HELP_SECTIONS, EXAM_SHORTCUT_LEGEND } from "../../lib/exam-help";

interface ExamHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Color swatches mirroring the sidebar question-grid legend. */
const GRID_SWATCHES = [
  { className: "bg-muted", label: "Belum dijawab" },
  { className: "bg-blue", label: "Sudah dijawab" },
  { className: "bg-amber", label: "Ragu-ragu" },
] as const;

/**
 * Static in-exam help dialog (#166): a plain controlled Dialog (no driver.js
 * overlay), so unlike the guided tour it is safe to open while anti-cheat
 * lockdown (fullscreen / focus-loss / OS keyboard lock) is enforced. Also
 * hosts the keyboard-shortcut legend (#178).
 */
export const ExamHelpDialog = ({ open, onOpenChange }: ExamHelpDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">Bantuan Ujian</DialogTitle>
          <DialogDescription>
            Panduan singkat cara mengerjakan ujian di layar ini.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {EXAM_HELP_SECTIONS.map((section) => (
            <section
              key={section.id}
              className="rounded-xl border-2 border-[var(--nb-ink)] bg-white p-4 shadow-[2px_2px_0_var(--nb-ink)]"
            >
              <h3 className="text-sm font-extrabold text-foreground mb-1">
                {section.title}
              </h3>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                {section.description}
              </p>
              {section.id === "grid" && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground">
                  {GRID_SWATCHES.map((swatch) => (
                    <span key={swatch.label} className="flex items-center gap-1.5">
                      <span
                        className={`w-3.5 h-3.5 rounded border-2 border-[var(--nb-ink)] ${swatch.className}`}
                      />
                      {swatch.label}
                    </span>
                  ))}
                </div>
              )}
            </section>
          ))}

          {/* Keyboard shortcut legend (#178) */}
          <section className="rounded-xl border-2 border-[var(--nb-ink)] bg-muted/50 p-4 shadow-[2px_2px_0_var(--nb-ink)]">
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-foreground mb-3">
              <Keyboard className="w-4 h-4" aria-hidden="true" />
              Pintasan keyboard
            </h3>
            <ul className="flex flex-col gap-2.5">
              {EXAM_SHORTCUT_LEGEND.map((item) => (
                <li key={item.keys} className="flex items-center gap-3 text-sm">
                  <kbd className="shrink-0 min-w-14 text-center px-2 py-1 rounded-lg border-2 border-[var(--nb-ink)] bg-white font-mono text-xs font-bold shadow-[1px_1px_0_var(--nb-ink)]">
                    {item.keys}
                  </kbd>
                  <span className="font-medium text-muted-foreground">
                    {item.description}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
