// @vitest-environment happy-dom
/**
 * TutorialCarouselDialog (#180) — the visual step-by-step help carousel.
 *
 * Covers the behavioural contract: step rendering (visual + title +
 * description), Prev/Next with the step counter, ←/→ keyboard navigation,
 * Escape-to-close, and the reduced-motion poster swap (matchMedia mocked).
 * Asset resolution is mocked so no real .webp files are needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TutorialCarouselDialog } from "../TutorialCarouselDialog";
import type { TutorialStep } from "../../../lib/help-content";

// Deterministic asset resolution: animated vs poster URL depends only on the
// reduced-motion flag the component passes in. The factory is hoisted, so it
// closes over the spy lazily (called at render time, after the spy exists).
const pickHelpImageSpy = vi.fn(
  (image: string, reducedMotion: boolean) => () =>
    Promise.resolve(reducedMotion ? `/mock/poster/${image}` : `/mock/anim/${image}`),
);
vi.mock("../../../lib/help-assets", () => ({
  pickHelpImage: (image: string, reducedMotion: boolean) =>
    pickHelpImageSpy(image, reducedMotion),
}));

const STEPS: TutorialStep[] = [
  { image: "groups/1.webp", title: "Buka halaman Grup", description: "Klik menu Grup di sebelah kiri." },
  { image: "groups/2.webp", title: "Klik tombol Buat grup", description: "Tombol ada di pojok kanan atas." },
  { image: "groups/3.webp", title: "Isi nama lalu simpan", description: "Tulis nama grup, lalu tekan Simpan." },
];

/** Controls what the mocked matchMedia reports for prefers-reduced-motion. */
let prefersReducedMotion = false;

function stubMatchMedia() {
  window.matchMedia = ((query: string) =>
    ({
      matches: prefersReducedMotion,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

function setup() {
  const onClose = vi.fn();
  render(
    <TutorialCarouselDialog open topicTitle="Tentang Grup" steps={STEPS} onClose={onClose} />,
  );
  return { onClose };
}

/** Asserts the live step counter, whose text spans several text nodes. */
function expectCounter(current: number, total: number) {
  const text = `Langkah ${current} dari ${total}`;
  expect(
    screen.getByText((_, el) => el?.tagName === "P" && el.textContent === text),
  ).toBeTruthy();
}

beforeEach(() => {
  prefersReducedMotion = false;
  stubMatchMedia();
});

afterEach(() => {
  cleanup();
  pickHelpImageSpy.mockClear();
});

describe("TutorialCarouselDialog", () => {
  it("renders the fixed header, topic, and the first step with its visual", async () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Azhura CBT — Penggunaan" })).toBeTruthy();
    expect(screen.getByText("Tentang Grup")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Buka halaman Grup" })).toBeTruthy();
    expect(screen.getByText("Klik menu Grup di sebelah kiri.")).toBeTruthy();
    expectCounter(1, 3);

    // The visual loads lazily and uses the step title as alt text.
    const img = await screen.findByAltText("Buka halaman Grup");
    expect(img.getAttribute("src")).toBe("/mock/anim/groups/1.webp");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("navigates with Berikutnya/Sebelumnya and updates the counter", () => {
    setup();
    expect(screen.getByRole("button", { name: /Sebelumnya/ })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: /Berikutnya/ }));
    expectCounter(2, 3);
    expect(screen.getByRole("heading", { name: "Klik tombol Buat grup" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sebelumnya/ })).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: /Sebelumnya/ }));
    expectCounter(1, 3);
    expect(screen.getByRole("heading", { name: "Buka halaman Grup" })).toBeTruthy();
  });

  it("shows 'Selesai' on the last step, which closes the dialog", () => {
    const { onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: /Berikutnya/ }));
    fireEvent.click(screen.getByRole("button", { name: /Berikutnya/ }));
    expectCounter(3, 3);
    expect(screen.queryByRole("button", { name: /Berikutnya/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Selesai" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("navigates with the arrow keys and clamps at both ends", () => {
    setup();

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expectCounter(1, 3); // clamped at the first step

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expectCounter(2, 3);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expectCounter(3, 3); // clamped at the last step

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expectCounter(2, 3);
  });

  it("closes on Escape without navigating", () => {
    const { onClose } = setup();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expectCounter(1, 3);
  });

  it("uses the static poster frame under prefers-reduced-motion", async () => {
    prefersReducedMotion = true;
    setup();

    const img = await screen.findByAltText("Buka halaman Grup");
    expect(img.getAttribute("src")).toBe("/mock/poster/groups/1.webp");
    await waitFor(() =>
      expect(pickHelpImageSpy).toHaveBeenCalledWith("groups/1.webp", true),
    );
  });
});
