/**
 * Azhura CBT App - Emoji picker button (#17)
 *
 * A composer affordance that opens an emoji-mart picker in a popover. The picker
 * and its (sizable) emoji dataset are loaded lazily on first open via dynamic
 * import, so they never weigh down the initial dashboard bundle. The data is
 * bundled with the app (passed via the `data` prop) — it never hits the network,
 * which matters for the offline-first Tauri exam client.
 */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "../ui/button";

// emoji-mart's React wrapper + the bundled dataset, code-split out of the
// dashboard chunk. `data` is loaded alongside so the picker renders offline.
const Picker = lazy(async () => {
  const [{ default: data }, react] = await Promise.all([
    import("@emoji-mart/data"),
    import("@emoji-mart/react"),
  ]);
  const Component = react.default;
  // Wrap so the resolved module shape matches React.lazy's default-export contract.
  return {
    default: (props: { onSelect: (emoji: string) => void }) => (
      <Component
        data={data}
        theme="light"
        previewPosition="none"
        skinTonePosition="none"
        onEmojiSelect={(e: { native?: string }) => {
          if (e.native) props.onSelect(e.native);
        }}
      />
    ),
  };
});

interface EmojiPickerButtonProps {
  /** Called with the chosen emoji's native character. */
  onSelect: (emoji: string) => void;
  /** Disables the trigger (e.g. while muted). */
  disabled?: boolean;
}

export function EmojiPickerButton({ onSelect, disabled }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the popover on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled}
        aria-label="Pilih emoji"
        onClick={() => setOpen((o) => !o)}
      >
        <Smile className="size-5" />
      </Button>

      {open && (
        <div className="absolute bottom-12 right-0 z-50 rounded-lg overflow-hidden border-2 border-[var(--nb-ink)] shadow-[3px_3px_0_var(--nb-ink)]">
          <Suspense
            fallback={
              <div className="grid h-72 w-72 place-items-center bg-white text-sm text-muted-foreground">
                Memuat emoji…
              </div>
            }
          >
            <Picker
              onSelect={(emoji) => {
                onSelect(emoji);
                setOpen(false);
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
