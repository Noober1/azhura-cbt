#!/usr/bin/env bash
#
# Azhura CBT — Help tutorial converter (#180).
#
# Converts the Playwright recordings produced by record-tutorials.ts into the
# final documentation assets the console ships:
#
#   recordings/<topic>/<step>.webm
#     → apps/console/src/assets/help/<topic>/<step>.webp         (animated, <10s)
#     → apps/console/src/assets/help/<topic>/<step>.poster.webp  (static frame,
#       shown under prefers-reduced-motion)
#
# Requires ffmpeg with libwebp. Run from the repo root:
#   scripts/help-assets/convert.sh
#
# Tuning knobs (env vars):
#   MAX_SECONDS=10   hard cap per animation (issue #180 requirement)
#   FPS=12           animation frame rate — keeps files small, still smooth
#   WIDTH=960        output width (height keeps aspect)
#   QUALITY=60       libwebp quality (0-100)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RECORDINGS_DIR="${SCRIPT_DIR}/recordings"
ASSETS_DIR="${REPO_ROOT}/apps/console/src/assets/help"

MAX_SECONDS="${MAX_SECONDS:-10}"
FPS="${FPS:-12}"
WIDTH="${WIDTH:-960}"
QUALITY="${QUALITY:-60}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found — install it first" >&2; exit 1; }
[ -d "${RECORDINGS_DIR}" ] || { echo "no recordings at ${RECORDINGS_DIR} — run record-tutorials.ts first" >&2; exit 1; }

shopt -s nullglob
converted=0

for video in "${RECORDINGS_DIR}"/*/*.webm; do
  topic="$(basename "$(dirname "${video}")")"
  step="$(basename "${video}" .webm)"
  out_dir="${ASSETS_DIR}/${topic}"
  mkdir -p "${out_dir}"

  # Animated WebP: capped duration, reduced fps, scaled, infinite loop.
  ffmpeg -y -loglevel error -i "${video}" -t "${MAX_SECONDS}" \
    -vf "fps=${FPS},scale=${WIDTH}:-2:flags=lanczos" \
    -c:v libwebp -q:v "${QUALITY}" -loop 0 -an \
    "${out_dir}/${step}.webp"

  # Static poster (first frame) for prefers-reduced-motion.
  ffmpeg -y -loglevel error -i "${video}" \
    -vf "select=eq(n\,0),scale=${WIDTH}:-2:flags=lanczos" -frames:v 1 \
    -c:v libwebp -q:v "${QUALITY}" -an \
    "${out_dir}/${step}.poster.webp"

  echo "converted ${topic}/${step} → ${step}.webp + ${step}.poster.webp"
  converted=$((converted + 1))
done

if [ "${converted}" -eq 0 ]; then
  echo "no .webm recordings found under ${RECORDINGS_DIR}/<topic>/" >&2
  exit 1
fi

echo "done: ${converted} step(s) written to ${ASSETS_DIR}"
echo "next: add the matching 'tutorial' steps to apps/console/src/lib/help-content.ts"
