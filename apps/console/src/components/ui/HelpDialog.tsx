/**
 * Azhura CBT Console — Help dialog (#134 / #137 / #180).
 *
 * Presentational dialog for one help entry from `help-content.ts`. Reused by
 * the per-page help button and the import-flow help button so help looks the
 * same everywhere.
 *
 * Two modes, chosen automatically per topic:
 *  - entry has a `tutorial` → the visual step-by-step carousel
 *    (<TutorialCarouselDialog/>, #180);
 *  - otherwise → the classic text dialog (paragraphs + numbered steps), which
 *    stays as the fallback for topics whose recordings don't exist yet.
 */

import { Modal } from "./Modal";
import { Button } from "./Button";
import { TutorialCarouselDialog } from "./TutorialCarouselDialog";
import { HELP_CONTENT, type HelpTopic } from "../../lib/help-content";

interface HelpDialogProps {
  open: boolean;
  topic: HelpTopic;
  onClose: () => void;
}

export function HelpDialog({ open, topic, onClose }: HelpDialogProps) {
  const entry = HELP_CONTENT[topic];

  if (entry.tutorial && entry.tutorial.length > 0) {
    return (
      <TutorialCarouselDialog
        open={open}
        topicTitle={entry.title}
        steps={entry.tutorial}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      open={open}
      title={entry.title}
      onClose={onClose}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Mengerti
        </Button>
      }
    >
      <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
        {entry.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}

        {entry.steps && entry.steps.length > 0 && (
          <div className="rounded-[var(--radius-card)] border-2 border-[var(--nb-ink)] bg-canvas p-4">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink">
              Langkah singkat
            </p>
            <ol className="space-y-2">
              {entry.steps.map((step, i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-[var(--nb-ink)] bg-highlight text-xs font-bold text-ink">
                    {i + 1}
                  </span>
                  <span className="text-ink">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Modal>
  );
}
