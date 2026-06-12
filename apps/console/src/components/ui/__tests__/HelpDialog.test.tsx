// @vitest-environment happy-dom
/**
 * HelpDialog (#180) — automatic mode selection per topic.
 *
 * The help content is mocked so both branches are exercised deterministically:
 * a topic WITH a `tutorial` must render the visual carousel, and a topic
 * WITHOUT one must keep the classic text dialog (paragraphs + numbered steps)
 * as the fallback. The real registry's completeness is covered separately in
 * `lib/__tests__/help-content.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HelpDialog } from "../HelpDialog";

vi.mock("../../../lib/help-content", () => ({
  HELP_CONTENT: {
    groups: {
      title: "Tentang Grup",
      body: ["Paragraf lama tentang grup."],
      steps: ["Langkah teks lama."],
      tutorial: [
        {
          image: "groups/1.webp",
          title: "Buka halaman Grup",
          description: "Klik menu Grup di sebelah kiri.",
        },
      ],
    },
    students: {
      title: "Tentang Peserta",
      body: ["Halaman ini berisi seluruh akun peserta."],
      steps: ["Klik \"Tambah siswa\"."],
    },
  },
}));

beforeEach(() => {
  // The carousel branch reads prefers-reduced-motion; keep it deterministic.
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
});

afterEach(cleanup);

describe("HelpDialog", () => {
  it("renders the visual carousel when the topic has a tutorial", () => {
    render(<HelpDialog open topic="groups" onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Azhura CBT — Penggunaan" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Buka halaman Grup" })).toBeTruthy();
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "Langkah 1 dari 1"),
    ).toBeTruthy();
    // The old text body must NOT leak into tutorial mode.
    expect(screen.queryByText("Paragraf lama tentang grup.")).toBeNull();
    // No asset is committed for the mocked step → visible placeholder, not an <img>.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/Peraga visual belum tersedia/)).toBeTruthy();
  });

  it("falls back to the classic text dialog when the topic has no tutorial", () => {
    render(<HelpDialog open topic="students" onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Tentang Peserta" })).toBeTruthy();
    expect(screen.getByText("Halaman ini berisi seluruh akun peserta.")).toBeTruthy();
    expect(screen.getByText('Klik "Tambah siswa".')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mengerti" })).toBeTruthy();
    // Nothing carousel-ish.
    expect(screen.queryByText(/Langkah 1 dari/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Berikutnya|Selesai/ })).toBeNull();
  });
});
