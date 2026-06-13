import { describe, it, expect } from "bun:test";
import { isPrivateAddress, rehostExternalUrl, type RehostOptions } from "./rehost-media";
import { BadRequestError } from "./errors";
import type { SavedFile } from "./upload";

describe("isPrivateAddress", () => {
  it("flags IPv4 loopback / private / link-local / CGNAT ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "255.255.255.255",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("allows public IPv4 (incl. addresses just outside private ranges)", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.255.255"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it("flags IPv6 loopback / unspecified / link-local / unique-local / mapped", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("flags hex-group and full-form IPv4-mapped IPv6 of private ranges", () => {
    expect(isPrivateAddress("::ffff:7f00:1")).toBe(true); // 127.0.0.1
    expect(isPrivateAddress("::ffff:0a00:0001")).toBe(true); // 10.0.0.1
    expect(isPrivateAddress("::ffff:c0a8:0101")).toBe(true); // 192.168.1.1
    expect(isPrivateAddress("0:0:0:0:0:ffff:169.254.169.254")).toBe(true); // cloud metadata
    expect(isPrivateAddress("::ffff:0808:0808")).toBe(false); // 8.8.8.8 (public)
  });

  it("allows public IPv6 and mapped public IPv4", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("returns false for non-IP-literal hosts (those are resolved via DNS first)", () => {
    expect(isPrivateAddress("example.com")).toBe(false);
  });
});

// ── rehostExternalUrl ────────────────────────────────────────────────────────

const SAVED: SavedFile = {
  filename: "uuid.png",
  originalName: "x.png",
  type: "image",
  mimeType: "image/png",
  sizeBytes: 3,
  url: "/uploads/images/uuid.png",
};

/** A fetch stub that returns a single-chunk 200 response of `bytes`. */
function okFetch(bytes: Uint8Array): RehostOptions["fetchImpl"] {
  return async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes);
          c.close();
        },
      }),
      { status: 200 }
    );
}

const PUBLIC_RESOLVER: RehostOptions["resolveHost"] = async () => ["93.184.216.34"];
const okSave: RehostOptions["saveImpl"] = async () => SAVED;

it("rejects a syntactically invalid URL", async () => {
  const res = await rehostExternalUrl("not a url", { saveImpl: okSave });
  expect(res).toEqual({ ok: false, reason: "invalid-url", detail: "not a url" });
});

it("rejects a non-http(s) scheme", async () => {
  const res = await rehostExternalUrl("ftp://files.example.com/x.png", { resolveHost: PUBLIC_RESOLVER });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe("blocked-scheme");
});

it("blocks a host that resolves to a private address", async () => {
  const res = await rehostExternalUrl("http://intranet.local/logo.png", {
    resolveHost: async () => ["10.0.0.5"],
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe("blocked-host");
});

it("blocks an IP-literal host in a private range without DNS", async () => {
  const res = await rehostExternalUrl("http://127.0.0.1:9000/admin.png", {});
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe("blocked-host");
});

it("re-validates redirects and blocks a hop that targets a private host", async () => {
  const resolveHost: RehostOptions["resolveHost"] = async (host) =>
    host === "safe.example" ? ["93.184.216.34"] : ["169.254.169.254"];
  const fetchImpl: RehostOptions["fetchImpl"] = async (input) => {
    const u = new URL(typeof input === "string" ? input : input.toString());
    if (u.hostname === "safe.example") {
      return new Response(null, { status: 302, headers: { location: "http://metadata.internal/creds" } });
    }
    throw new Error("should never fetch the private hop");
  };
  const res = await rehostExternalUrl("http://safe.example/img.png", { resolveHost, fetchImpl });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe("blocked-host");
});

it("gives up after too many redirects", async () => {
  let n = 0;
  const fetchImpl: RehostOptions["fetchImpl"] = async () => {
    n++;
    return new Response(null, { status: 302, headers: { location: `http://safe.example/hop${n}` } });
  };
  const res = await rehostExternalUrl("http://safe.example/start", {
    resolveHost: PUBLIC_RESOLVER,
    fetchImpl,
    maxRedirects: 2,
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe("too-many-redirects");
});

it("aborts a body that exceeds the streamed size cap", async () => {
  const big = new Uint8Array(100);
  const res = await rehostExternalUrl("http://safe.example/big.png", {
    resolveHost: PUBLIC_RESOLVER,
    fetchImpl: okFetch(big),
    maxBytes: 10,
    saveImpl: okSave,
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe("too-large");
});

it("maps a rejected upload audit (BadRequestError) to unsupported-type", async () => {
  const res = await rehostExternalUrl("http://safe.example/x.exe", {
    resolveHost: PUBLIC_RESOLVER,
    fetchImpl: okFetch(new Uint8Array([1, 2, 3])),
    saveImpl: async () => {
      throw new BadRequestError("Tipe file tidak didukung");
    },
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe("unsupported-type");
});

it("maps a non-audit save failure (e.g. disk error) to fetch-failed, not unsupported-type", async () => {
  const res = await rehostExternalUrl("http://safe.example/x.png", {
    resolveHost: PUBLIC_RESOLVER,
    fetchImpl: okFetch(new Uint8Array([1, 2, 3])),
    saveImpl: async () => {
      throw new Error("ENOSPC: no space left on device");
    },
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe("fetch-failed");
});

it("surfaces a network failure as fetch-failed", async () => {
  const res = await rehostExternalUrl("http://safe.example/x.png", {
    resolveHost: PUBLIC_RESOLVER,
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe("fetch-failed");
});

it("downloads, audits, and returns the stored file on success", async () => {
  const res = await rehostExternalUrl("http://safe.example/diagram.png", {
    resolveHost: PUBLIC_RESOLVER,
    fetchImpl: okFetch(new Uint8Array([1, 2, 3])),
    saveImpl: okSave,
  });
  expect(res).toEqual({ ok: true, saved: SAVED });
});

it("can bypass the private-network guard when explicitly disabled", async () => {
  const res = await rehostExternalUrl("http://127.0.0.1/x.png", {
    blockPrivateNetworks: false,
    fetchImpl: okFetch(new Uint8Array([1, 2, 3])),
    saveImpl: okSave,
  });
  expect(res).toEqual({ ok: true, saved: SAVED });
});
