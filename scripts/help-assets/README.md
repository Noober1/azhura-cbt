# Help tutorial asset pipeline (#180)

Produces the visual step-by-step tutorials shown by the console's help dialog:
short **animated WebP** clips (one per step, <10s) plus a **static poster
frame** per clip for `prefers-reduced-motion`. These are static documentation
assets committed to the repo at `apps/console/src/assets/help/<topic>/` — they
never go through `/uploads` or the media library.

```
record-tutorials.ts   Playwright → recordings/<topic>/<step>.webm
convert.sh            ffmpeg     → apps/console/src/assets/help/<topic>/<step>.webp
                                  + <step>.poster.webp (reduced-motion frame)
```

## Prerequisites

- MariaDB + backend running, seeded with the e2e dataset:
  `cd apps/e2e && bun run seed` (admin `900001` / `admin@123`)
- Console dev server: `bun run console:dev` (port 1430)
- Chromium for Playwright: `cd apps/e2e && bun run install:browsers`
- `ffmpeg` with libwebp on PATH

## Usage (from the repo root)

```bash
# 1. Record all planned journeys (or a single topic)
bun scripts/help-assets/record-tutorials.ts
bun scripts/help-assets/record-tutorials.ts groups

# 2. Convert recordings → animated WebP + poster into apps/console/src/assets/help/
scripts/help-assets/convert.sh
```

Override defaults with env vars: `TUTORIAL_CONSOLE_URL`, `TUTORIAL_ADMIN_NIS`,
`TUTORIAL_ADMIN_PASSWORD` (recorder); `MAX_SECONDS`, `FPS`, `WIDTH`, `QUALITY`
(converter).

## Wiring a topic up

1. Add/extend its journey in `RECORDINGS` inside `record-tutorials.ts`
   (one entry per step; keep each clip's actions under ~8 seconds).
2. Run both scripts above and check the generated `.webp` files render well.
3. Add the matching `tutorial` array to the topic's entry in
   `apps/console/src/lib/help-content.ts`:

   ```ts
   tutorial: [
     { image: "groups/1.webp", title: "Buka halaman Grup", description: "…" },
   ],
   ```

   `image` is relative to `src/assets/help/`. The help dialog switches to the
   visual carousel automatically; topics **without** a `tutorial` keep the
   existing text dialog, so the feature ships even while assets are missing.
   Posters are picked up by the `<step>.poster.webp` naming convention — no
   extra wiring needed.

## Notes

- `recordings/` and the intermediate `.webm` files are throwaway build inputs;
  only the converted `.webp`/`.poster.webp` pairs get committed.
- Recording requires a live, seeded environment. If that's not available,
  leave the topics on their text fallback — do not commit placeholder images.
