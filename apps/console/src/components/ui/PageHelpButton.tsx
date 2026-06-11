/**
 * Azhura CBT Console — Per-page help button (#134).
 *
 * A small, low-emphasis "?" button placed in a page's header action area,
 * visually separated from the page's primary action. Clicking it opens a dialog
 * explaining that page, with content sourced from `help-content.ts`.
 *
 * Usage: <PageHelpButton topic="groups" />
 */

import { useState } from "react";
import { Button } from "./Button";
import { HelpCircleIcon } from "./icons";
import { Tooltip } from "./Tooltip";
import { HelpDialog } from "./HelpDialog";
import { HELP_CONTENT, type HelpTopic } from "../../lib/help-content";

interface PageHelpButtonProps {
  topic: HelpTopic;
}

export function PageHelpButton({ topic }: PageHelpButtonProps) {
  const [open, setOpen] = useState(false);
  const label = `Bantuan: ${HELP_CONTENT[topic].title}`;

  return (
    <>
      <Tooltip label="Bantuan halaman ini">
        <Button
          variant="secondary"
          size="md"
          aria-label={label}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="px-3"
        >
          <HelpCircleIcon className="size-[18px]" />
        </Button>
      </Tooltip>

      <HelpDialog open={open} topic={topic} onClose={() => setOpen(false)} />
    </>
  );
}
