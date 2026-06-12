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

## Cara manual / cepat (tanpa Playwright) — pakai ImageMagick

Kalau kamu cuma mau menambahkan satu topik tanpa menyalakan seluruh stack
(atau ingin membuat peraga gambar tangan, bukan rekaman layar), kamu bisa
membuat aset langsung dengan ImageMagick (`magick`) + `ffmpeg`. Pola yang
diharapkan komponen carousel:

```
apps/console/src/assets/help/<topic>/<step>.webp         ← klip animasi (yang ditampilkan)
apps/console/src/assets/help/<topic>/<step>.poster.webp  ← 1 frame statis (untuk prefers-reduced-motion)
```

`<step>` mulai dari `1`. Field `image` di `help-content.ts` selalu menunjuk
file animasi (`<topic>/<step>.webp`) — **jangan** menunjuk `.poster.webp`;
poster dipilih otomatis lewat konvensi nama.

Contoh membuat 1 langkah (frame statis + animasi 2-frame yang berdenyut):

```bash
cd apps/console/src/assets/help && mkdir -p mytopic

# poster statis (juga jadi frame pertama animasi)
magick -size 960x540 xc:"#FEF3C7" -gravity center \
  -pointsize 44 -fill "#92400E" -annotate +0-40 "Langkah 1" \
  -pointsize 28 -annotate +0+30 "Penjelasan singkat langkah" \
  mytopic/1.poster.webp

# frame kedua (warna sedikit beda → kesan animasi)
magick -size 960x540 xc:"#FDE68A" -gravity center \
  -pointsize 44 -fill "#92400E" -annotate +0-40 "Langkah 1" \
  -pointsize 28 -annotate +0+30 "Penjelasan singkat langkah" \
  /tmp/1b.webp

# gabung jadi animated WebP (delay 60 = 0.6s/frame, loop selamanya)
magick -delay 60 -loop 0 mytopic/1.poster.webp /tmp/1b.webp mytopic/1.webp
```

> Untuk screenshot asli aplikasi: ganti perintah `magick -size … xc:…` dengan
> file PNG hasil tangkapan layar (`magick tangkapan.png -resize 960x540 …`),
> lalu rangkai beberapa screenshot jadi animasi dengan `magick -delay N a.webp
> b.webp out.webp`. Jaga tiap klip < 10 detik (lihat `MAX_SECONDS` di
> `convert.sh` bila berangkat dari video).

Lalu wire topiknya di `help-content.ts` (lihat bagian "Wiring a topic up" di
atas). Jalankan `bun run test` + `bun run build` di `apps/console` untuk
memastikan registry `import.meta.glob` menemukan aset baru.

### Verifikasi cepat di browser
1. `bun run console:dev`, buka halaman topik tersebut.
2. Klik tombol bantuan "?" → dialog kini tampil sebagai carousel bergambar.
3. Uji navigasi `←/→`, hitungan langkah, `Esc`, dan mode hemat-gerak
   (DevTools → Rendering → "Emulate prefers-reduced-motion" → harus menampilkan
   frame poster statis).

## Notes

- `recordings/` and the intermediate `.webm` files are throwaway build inputs;
  only the converted `.webp`/`.poster.webp` pairs get committed.
- Recording requires a live, seeded environment. If that's not available,
  leave the topics on their text fallback — do not commit placeholder images.
- Komponen carousel: `apps/console/src/components/ui/TutorialCarouselDialog.tsx`;
  pemilihan poster vs animasi: `apps/console/src/lib/help-assets.ts`
  (`pickHelpImage`). Test relevan: `lib/__tests__/help-assets.test.ts`,
  `components/ui/__tests__/TutorialCarouselDialog.test.tsx`.
