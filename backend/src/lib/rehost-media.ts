/**
 * Azhura CBT Backend — External-media rehosting (#190).
 *
 * Downloads a remote media asset, runs it through the same security audit as a
 * direct upload ({@link validateAndSave}: magic-byte MIME detection + per-type
 * size limits + UUID storage), and returns the stored `/uploads/...` metadata.
 * Used to (a) migrate legacy questions that still reference external media and
 * (b) back the `POST /admin/media/from-url` endpoint that auto-rehosts images an
 * author pastes from the web — both turning an external fetch the locked-down
 * exam client would otherwise perform into a local asset.
 *
 * SECURITY — this performs a *server-side fetch of a caller-influenced URL*, a
 * classic SSRF sink. Guards (all on by default):
 * - scheme allow-list (`http:`/`https:` only),
 * - the resolved host must NOT be a private / loopback / link-local / CGNAT /
 *   unique-local address (blocks reaching internal services / cloud metadata),
 * - redirects are followed manually and EACH hop is re-validated (a public URL
 *   cannot 302 into `http://169.254.169.254/…`),
 * - a DNS-resolution timeout and a per-request wall-clock + total deadline, and
 *   a streamed byte cap that aborts before an oversized body is buffered.
 *
 * RESIDUAL RISK — DNS rebinding / TOCTOU: the host is validated by resolving it
 * here, but the subsequent `fetch` resolves the name again, so a hostile DNS
 * server with TTL=0 could answer "public" during the check and "private" at
 * connect time. Fully closing this needs IP-pinned connect (not portable on Bun
 * `fetch`). This is an admin-only feature with `blockPrivateNetworks` on by
 * default; for hostile-input exposure, pair it with an OS egress firewall that
 * blocks the backend process from reaching RFC1918 / link-local ranges.
 *
 * Failures never throw; they return a structured `{ ok: false, reason }` so the
 * caller (migration summary / endpoint error mapping) can react deterministically.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SavedFile } from "./upload";
import { getErrorMessage, BadRequestError } from "./errors";

// NOTE: this module is deliberately free of runtime imports that pull in the
// logger → log-files → log-store → db chain, so its SSRF guards stay unit-testable
// without DB credentials. `./upload` is type-only here and lazy-imported at call
// time for the default save step; callers own outcome logging.

/** Default request timeout (ms). */
const DEFAULT_TIMEOUT_MS = 15_000;
/** Hard cap on DNS resolution per hop so a slow resolver can't pin the event loop. */
const DNS_TIMEOUT_MS = 5_000;
/** Default streamed download cap (bytes) — matches the largest per-type upload limit (video, 50 MiB). */
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
/** Default maximum redirect hops to follow before giving up. */
const DEFAULT_MAX_REDIRECTS = 3;

/** Why a rehost attempt did not produce a stored file. */
export type RehostFailureReason =
  | "invalid-url"
  | "blocked-scheme"
  | "blocked-host"
  | "too-many-redirects"
  | "fetch-failed"
  | "too-large"
  | "unsupported-type";

export type RehostResult =
  | { ok: true; saved: SavedFile }
  | { ok: false; reason: RehostFailureReason; detail?: string };

/** The subset of `fetch` this module uses — narrow enough that test stubs satisfy it. */
export type FetchFn = (input: URL | string, init?: RequestInit) => Promise<Response>;

export interface RehostOptions {
  /** Reject hosts resolving to private/loopback/link-local ranges. Default `true`. */
  blockPrivateNetworks?: boolean;
  /** Max bytes to download before aborting. Default 50 MiB. */
  maxBytes?: number;
  /** Wall-clock timeout per request (ms). Default 15000. */
  timeoutMs?: number;
  /** Max redirect hops to follow. Default 3. */
  maxRedirects?: number;
  /** User id recorded as the uploader of the stored file. */
  uploadedByUserId?: string;
  /** Injected `fetch` (tests). Default global `fetch`. */
  fetchImpl?: FetchFn;
  /** Injected DNS resolver returning all addresses for a host (tests). */
  resolveHost?: (host: string) => Promise<string[]>;
  /** Injected save step (tests) — defaults to {@link validateAndSave}. */
  saveImpl?: (file: File, uploadedByUserId: string) => Promise<SavedFile>;
}

/** Parses a dotted-quad IPv4 string into its four octets, or `null` if malformed. */
function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets as [number, number, number, number];
}

/** True when an IPv4 address falls in a non-public (private/loopback/link-local/…) range. */
function isPrivateIpv4(ip: string): boolean {
  const octets = parseIpv4(ip);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0 && octets[2] === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a >= 224) return true; // multicast (224/4) + reserved/broadcast (240/4, 255.255.255.255)
  return false;
}

/**
 * True when an address (IPv4 or IPv6 literal) is not routable on the public
 * internet and so must not be fetched server-side. IPv6 checks cover loopback
 * (`::1`), unspecified (`::`), unique-local (`fc00::/7`), link-local
 * (`fe80::/10`), and IPv4-mapped (`::ffff:a.b.c.d`, delegated to the IPv4 rule).
 */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind !== 6) return false; // not an IP literal → caller resolves via DNS first

  const lower = ip.toLowerCase();
  // IPv4-mapped, dotted-decimal form: ::ffff:a.b.c.d or the full 0:0:0:0:0:ffff:a.b.c.d.
  const mapped = lower.match(/^(?:::ffff:|(?:0:){5}ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  // IPv4-mapped, hex-group form: ::ffff:7f00:1 ≡ 127.0.0.1.
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
  }
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique-local
  return false;
}

/** Resolves a hostname to all addresses, or treats an IP-literal host as already resolved. */
async function resolveAddresses(
  host: string,
  resolveHost: (host: string) => Promise<string[]>
): Promise<string[]> {
  if (isIP(host) !== 0) return [host];
  return resolveHost(host);
}

/**
 * Validates a URL's scheme and (optionally) that its host resolves only to
 * public addresses. Returned discriminated result lets the caller map a
 * specific {@link RehostFailureReason}; re-run per redirect hop.
 */
async function checkUrlAllowed(
  url: URL,
  opts: Required<Pick<RehostOptions, "blockPrivateNetworks">> &
    Pick<RehostOptions, "resolveHost">
): Promise<{ ok: true } | { ok: false; reason: RehostFailureReason; detail?: string }> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "blocked-scheme", detail: url.protocol };
  }
  if (!opts.blockPrivateNetworks) return { ok: true };

  const resolveHost = opts.resolveHost ?? defaultResolveHost;
  let addresses: string[];
  try {
    addresses = await resolveAddresses(url.hostname, resolveHost);
  } catch (err) {
    return { ok: false, reason: "blocked-host", detail: getErrorMessage(err) };
  }
  if (addresses.length === 0) {
    return { ok: false, reason: "blocked-host", detail: "no DNS records" };
  }
  const blocked = addresses.find((addr) => isPrivateAddress(addr));
  if (blocked) {
    return { ok: false, reason: "blocked-host", detail: `${url.hostname} → ${blocked}` };
  }
  return { ok: true };
}

/** Production DNS resolver: every A/AAAA record for the host, bounded by a timeout. */
async function defaultResolveHost(host: string): Promise<string[]> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("DNS resolution timed out")), DNS_TIMEOUT_MS)
  );
  const resolve = lookup(host, { all: true }).then((records) => records.map((r) => r.address));
  return Promise.race([resolve, timeout]);
}

/**
 * Reads a response body into a single `Uint8Array`, aborting once `maxBytes` is
 * exceeded. Returns a fresh `ArrayBuffer`-backed array (a valid `BlobPart`), not
 * a Node `Buffer`, so it composes with the `File` constructor under bun-types.
 */
async function readCapped(
  res: Response,
  maxBytes: number
): Promise<{ ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false }> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > maxBytes ? { ok: false } : { ok: true, bytes: buf };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: merged };
}

/** Derives a best-effort filename from a URL path (validateAndSave re-detects the real type). */
function filenameFromUrl(url: URL): string {
  const base = url.pathname.split("/").filter(Boolean).pop();
  if (!base || base.length === 0) return "remote-media";
  try {
    return decodeURIComponent(base);
  } catch {
    // Malformed percent-encoding — keep the raw segment rather than throwing.
    return base;
  }
}

/**
 * Downloads, audits, and stores a remote media asset. See the module header for
 * the SSRF threat model and guarantees. Never throws — returns a structured
 * {@link RehostResult}.
 */
export async function rehostExternalUrl(
  rawUrl: string,
  opts: RehostOptions = {}
): Promise<RehostResult> {
  const blockPrivateNetworks = opts.blockPrivateNetworks ?? true;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const saveImpl =
    opts.saveImpl ??
    (async (file: File, uid: string): Promise<SavedFile> => {
      // Lazy so the SSRF guards above stay importable without the upload→logger→db chain.
      const { validateAndSave } = await import("./upload");
      return validateAndSave(file, uid);
    });
  const uploadedByUserId = opts.uploadedByUserId ?? "system";

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid-url", detail: rawUrl };
  }

  // Follow redirects manually so every hop is re-validated against the SSRF guard.
  // A total deadline bounds the whole chain so per-hop timeouts can't accumulate.
  const deadline = Date.now() + timeoutMs * (maxRedirects + 1);
  let response: Response | undefined;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const allowed = await checkUrlAllowed(url, {
      blockPrivateNetworks,
      resolveHost: opts.resolveHost,
    });
    if (!allowed.ok) return allowed;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return { ok: false, reason: "fetch-failed", detail: "deadline exceeded" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remainingMs));
    let res: Response;
    try {
      res = await fetchImpl(url, { redirect: "manual", signal: controller.signal });
    } catch (err) {
      return { ok: false, reason: "fetch-failed", detail: getErrorMessage(err) };
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { ok: false, reason: "fetch-failed", detail: `redirect ${res.status} without Location` };
      }
      try {
        url = new URL(location, url);
      } catch {
        return { ok: false, reason: "invalid-url", detail: location };
      }
      continue;
    }

    if (!res.ok) {
      return { ok: false, reason: "fetch-failed", detail: `HTTP ${res.status}` };
    }
    response = res;
    break;
  }

  if (!response) {
    return { ok: false, reason: "too-many-redirects" };
  }

  const capped = await readCapped(response, maxBytes);
  if (!capped.ok) return { ok: false, reason: "too-large" };

  const file = new File([capped.bytes], filenameFromUrl(url));
  try {
    const saved = await saveImpl(file, uploadedByUserId);
    return { ok: true, saved };
  } catch (err) {
    // validateAndSave throws BadRequestError for an unsupported type / oversize;
    // anything else (disk full, permission, malformed buffer) is infrastructure,
    // not a content-type problem, so don't mislabel it as "unsupported-type".
    const reason: RehostFailureReason = err instanceof BadRequestError ? "unsupported-type" : "fetch-failed";
    return { ok: false, reason, detail: getErrorMessage(err) };
  }
}
