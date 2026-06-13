/**
 * Azhura CBT Backend — External-media scrub migration (#190).
 *
 * One-off, idempotent migration that closes the read-side gap left by PR #189:
 * questions authored before the stem guard existed can still hold media that
 * points at external URLs (in `questions.text`) or an external `options.image_url`.
 * At render the exam client would fetch those URLs mid-exam — the IP-leak risk
 * #189 closed on the write path, but for legacy rows.
 *
 * For each reference it: keeps local `/uploads/...`; relativizes self-origin
 * absolute URLs; and **rehosts** genuinely external ones (download + the same
 * audit as a direct upload, then store locally) — rewriting the reference to the
 * local copy and registering it in the media library. References that can't be
 * rehosted are dropped by default (`--keep-failed` leaves them for review).
 *
 * Usage (run from `backend/`):
 *   bun run scrub:media                         # DRY RUN — report only, no writes
 *   bun run scrub:media --apply                 # perform the migration
 *   bun run scrub:media --apply --keep-failed   # don't drop refs that fail to rehost
 *   bun run scrub:media --self-origin=https://exam.sekolah.id   # extra "our" origins
 *   bun run scrub:media --as-user=<userId>      # owner for rehosted media rows
 *
 * Self origins (for relativizing absolute self URLs) default to the configured
 * `CORS_ORIGIN` entries plus `http://localhost:<PORT>` and `http://127.0.0.1:<PORT>`;
 * `--self-origin` adds more. Idempotent: a second run writes nothing.
 */

import { eq, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, pool, schema } from "../db";
import { createLogger } from "../lib/logger";
import { getServerConfig } from "../lib/env";
import { ensureUploadDirs } from "../lib/upload";
import { rehostExternalUrl } from "../lib/rehost-media";
import {
  classifyMediaUrl,
  collectStemMedia,
  normalizeOrigins,
  scrubImageUrl,
  scrubStemMedia,
  type MediaAction,
  type RehostFn,
  type ScrubContext,
} from "../lib/media-scrub";
import type { RehostResult } from "../lib/rehost-media";

const { questions, options, media, users } = schema;
const log = createLogger("ScrubMedia");

interface Args {
  apply: boolean;
  keepFailed: boolean;
  selfOrigins: string[];
  asUser?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, keepFailed: false, selfOrigins: [], help: false };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg === "--keep-failed") args.keepFailed = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--self-origin=")) {
      args.selfOrigins.push(...arg.slice("--self-origin=".length).split(","));
    } else if (arg.startsWith("--as-user=")) {
      args.asUser = arg.slice("--as-user=".length).trim();
    } else {
      log.warn(`Argumen tidak dikenal diabaikan: ${arg}`);
    }
  }
  return args;
}

const HELP = `scrub-external-media — migrasi media eksternal soal lama (#190)

  bun run scrub:media [opsi]

Opsi:
  --apply                Lakukan perubahan (default: dry-run, hanya laporan).
  --keep-failed          Jangan hapus referensi yang gagal di-rehost (default: dihapus saat --apply).
  --self-origin=<o>[,..] Origin tambahan yang dianggap milik kita (untuk merelatifkan URL absolut).
  --as-user=<userId>     Pemilik baris media hasil rehost (default: admin pertama).
  -h, --help             Tampilkan bantuan ini.`;

/** Derives the set of origins whose absolute `/uploads/` URLs are ours to relativize. */
function resolveSelfOrigins(extra: string[]): string[] {
  const { corsOrigins, port } = getServerConfig();
  return normalizeOrigins([
    ...corsOrigins,
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    ...extra,
  ]);
}

/** Finds the user id rehosted media should be attributed to (first admin, unless overridden). */
async function resolveUploaderId(asUser?: string): Promise<string | null> {
  if (asUser) return asUser;
  const admin = await db.query.users.findFirst({ where: eq(users.role, "admin") });
  return admin?.id ?? null;
}

/** Running tallies for the final summary. */
interface Tally {
  relativized: number;
  rehosted: number;
  dropped: number;
  failed: number;
}

function tallyAction(t: Tally, action: MediaAction): void {
  if (action.kind === "relativized") t.relativized++;
  else if (action.kind === "rehosted") t.rehosted++;
  else if (action.kind === "dropped") t.dropped++;
  else if (action.kind === "failed") t.failed++;
}

// ── Dry run: report only ─────────────────────────────────────────────────────

async function runDryRun(selfOrigins: string[]): Promise<void> {
  log.info("DRY RUN — tidak ada perubahan yang ditulis. Gunakan --apply untuk menjalankan.");

  const stems = await db.select({ id: questions.id, text: questions.text }).from(questions);
  const optionRows = await db
    .select({ id: options.id, imageUrl: options.imageUrl })
    .from(options)
    .where(isNotNull(options.imageUrl));

  let selfCount = 0;
  let externalCount = 0;

  for (const q of stems) {
    for (const ref of collectStemMedia(q.text, selfOrigins)) {
      if (ref.classification === "self-origin") selfCount++;
      else externalCount++;
      log.info(`questions.text [${q.id}] ${ref.classification}: ${ref.value}`);
    }
  }
  for (const o of optionRows) {
    const url = o.imageUrl as string;
    // image_url is a single URL column (not HTML) — classify it directly, exactly
    // as the apply path does, rather than wrapping it in a synthetic <img> tag.
    const classification = classifyMediaUrl(url, selfOrigins);
    if (classification === "local") continue;
    if (classification === "self-origin") selfCount++;
    else externalCount++;
    log.info(`options.image_url [${o.id}] ${classification}: ${url}`);
  }

  log.info("Ringkasan dry-run", {
    selfOrigin: selfCount,
    external: externalCount,
    note: "self-origin akan direlatifkan; external akan di-rehost (gagal → dihapus, kecuali --keep-failed)",
  });
}

// ── Apply: relativize / rehost / drop ────────────────────────────────────────

async function runApply(ctx: ScrubContext, uploaderId: string | null): Promise<void> {
  log.info("APPLY — menjalankan migrasi.", {
    selfOrigins: ctx.selfOrigins,
    stripFailed: ctx.stripFailed,
  });

  const tally: Tally = { relativized: 0, rehosted: 0, dropped: 0, failed: 0 };
  const insertedMediaUrls = new Set<string>();

  /**
   * Builds the media-library row for a rehosted asset, once per distinct local
   * URL. Returns `null` when the action isn't a rehost or the asset is already
   * registered. (The de-dup set is updated here; the row is inserted inside the
   * caller's transaction — safe for a one-off script that aborts on any error.)
   */
  function pendingMediaRow(action: MediaAction): typeof media.$inferInsert | null {
    if (action.kind !== "rehosted" || insertedMediaUrls.has(action.value)) return null;
    insertedMediaUrls.add(action.value);
    const { saved } = action;
    return {
      id: randomUUID(),
      filename: saved.filename,
      originalName: saved.originalName,
      type: saved.type,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      url: saved.url,
      uploadedBy: uploaderId,
      createdAt: Date.now(),
    };
  }

  function logFailureOrDrop(label: string, action: MediaAction): void {
    if (action.kind === "failed") {
      log.warn(`${label} gagal rehost (dibiarkan): ${action.from}`, { reason: action.reason });
    } else if (action.kind === "dropped") {
      log.warn(`${label} dihapus (gagal rehost): ${action.from}`, { reason: action.reason });
    }
  }

  const stems = await db.select({ id: questions.id, text: questions.text }).from(questions);
  for (const q of stems) {
    const result = await scrubStemMedia(q.text, ctx);
    for (const action of result.actions) {
      tallyAction(tally, action);
      logFailureOrDrop(`questions.text [${q.id}]`, action);
    }
    if (!result.changed) continue;
    // Atomic per row: media inserts + the stem rewrite commit together, so a
    // crash can't leave a media row whose question still holds the external URL.
    const rows = result.actions.map(pendingMediaRow).filter((r): r is typeof media.$inferInsert => r !== null);
    await db.transaction(async (tx) => {
      for (const row of rows) await tx.insert(media).values(row);
      await tx.update(questions).set({ text: result.html }).where(eq(questions.id, q.id));
    });
    log.info(`questions.text [${q.id}] diperbarui.`);
  }

  const optionRows = await db
    .select({ id: options.id, imageUrl: options.imageUrl })
    .from(options)
    .where(isNotNull(options.imageUrl));
  for (const o of optionRows) {
    const result = await scrubImageUrl(o.imageUrl as string, ctx);
    tallyAction(tally, result.action);
    logFailureOrDrop(`options.image_url [${o.id}]`, result.action);
    if (!result.changed) continue;
    const row = pendingMediaRow(result.action);
    await db.transaction(async (tx) => {
      if (row) await tx.insert(media).values(row);
      await tx.update(options).set({ imageUrl: result.value }).where(eq(options.id, o.id));
    });
    log.info(`options.image_url [${o.id}] diperbarui → ${result.value ?? "NULL"}.`);
  }

  log.info("Migrasi selesai.", { ...tally, mediaRegistered: insertedMediaUrls.size });
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    log.info(HELP);
    return;
  }

  ensureUploadDirs();
  const selfOrigins = resolveSelfOrigins(args.selfOrigins);

  if (!args.apply) {
    await runDryRun(selfOrigins);
    return;
  }

  const uploaderId = await resolveUploaderId(args.asUser);

  // Memoize per distinct source URL so an image shared across many questions is
  // downloaded and stored ONCE, not once per occurrence (cross-row de-dup).
  const rehostCache = new Map<string, RehostResult>();
  const rehost: RehostFn = async (url) => {
    const cached = rehostCache.get(url);
    if (cached) return cached;
    const result = await rehostExternalUrl(url, {
      blockPrivateNetworks: true,
      uploadedByUserId: uploaderId ?? "system",
    });
    rehostCache.set(url, result);
    return result;
  };

  const ctx: ScrubContext = { selfOrigins, rehost, stripFailed: !args.keepFailed };
  await runApply(ctx, uploaderId);
}

try {
  await main();
} catch (error) {
  log.error("Scrub media gagal", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
