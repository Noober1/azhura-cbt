// @vitest-environment happy-dom
/**
 * QuestionCard — kartu soal bersama untuk daftar soal admin & supervisor.
 * Kontrak visual yang diuji: nomor + badge tipe per tipe soal, huruf opsi
 * SELALU tampil dengan tanda ✓ di samping huruf pada kunci pilihan ganda
 * (tanpa baris redundan "Jawaban benar: X"), kunci jawaban per tipe non-PG,
 * dan aksi edit/hapus yang nonaktif saat kartu dikunci.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { QuestionConfig } from "@azhura/shared";
import type { AdminQuestion } from "../../../types";
import { QuestionCard } from "../QuestionCard";

// QuestionContentRenderer menyuntikkan HTML via DOMPurify + KaTeX — di luar
// kontrak kartu ini. Mock jadi teks polos agar assert konten tetap mudah.
vi.mock("../../supervisor/QuestionContentRenderer", () => ({
  QuestionContentRenderer: ({ html, className = "" }: { html: string; className?: string }) => (
    <div className={className}>{html}</div>
  ),
}));

// Vitest globals nonaktif di repo ini — auto-cleanup @testing-library tidak
// terpasang, jadi unmount manual antar test.
afterEach(cleanup);

function makeQuestion(overrides: Partial<AdminQuestion> = {}): AdminQuestion {
  return {
    id: "q-1",
    text: "Apa ibu kota Indonesia?",
    type: "multiple_choice",
    config: null,
    orderIndex: 0,
    correctOptionId: "opt-b",
    options: [
      { id: "opt-a", text: "Bandung" },
      { id: "opt-b", text: "Jakarta" },
      { id: "opt-c", text: "Surabaya" },
    ],
    ...overrides,
  };
}

function renderCard(question: AdminQuestion, props: Partial<Parameters<typeof QuestionCard>[0]> = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <QuestionCard
      question={question}
      index={0}
      onEdit={onEdit}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onEdit, onDelete };
}

describe("QuestionCard — pilihan ganda", () => {
  it("menampilkan nomor, badge tipe, dan teks soal", () => {
    renderCard(makeQuestion());

    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Pilihan Ganda")).toBeTruthy();
    expect(screen.getByText("Apa ibu kota Indonesia?")).toBeTruthy();
  });

  it("selalu menampilkan huruf opsi — termasuk pada opsi benar", () => {
    renderCard(makeQuestion());

    expect(screen.getByText("A.")).toBeTruthy();
    expect(screen.getByText("B.")).toBeTruthy();
    expect(screen.getByText("C.")).toBeTruthy();
  });

  it("menandai opsi benar dengan ✓ di samping huruf + highlight positif", () => {
    renderCard(makeQuestion());

    const marks = screen.getAllByLabelText("Jawaban benar");
    expect(marks).toHaveLength(1);

    const correctRow = screen.getByText("Jakarta").closest("li");
    expect(correctRow?.className).toContain("bg-positive-wash");
    const wrongRow = screen.getByText("Bandung").closest("li");
    expect(wrongRow?.className).not.toContain("bg-positive-wash");
  });

  it("tidak menampilkan baris redundan 'Jawaban benar: X'", () => {
    renderCard(makeQuestion());

    expect(screen.queryByText(/Jawaban benar:/)).toBeNull();
  });

  it("memperlakukan soal lama tanpa `type` sebagai pilihan ganda", () => {
    renderCard(makeQuestion({ type: undefined as unknown as AdminQuestion["type"] }));

    expect(screen.getByText("Pilihan Ganda")).toBeTruthy();
    expect(screen.getByText("A.")).toBeTruthy();
  });
});

describe("QuestionCard — kunci jawaban per tipe", () => {
  it("fill_in_blank: menampilkan jawaban dari config (string JSON mentah)", () => {
    renderCard(
      makeQuestion({
        type: "fill_in_blank",
        options: [],
        correctOptionId: null,
        config: '{"answer":"Proklamasi"}' as unknown as QuestionConfig,
      }),
    );

    expect(screen.getByText("Isi Jawaban")).toBeTruthy();
    expect(screen.getByText(/Jawaban benar:/)).toBeTruthy();
    expect(screen.getByText("Proklamasi")).toBeTruthy();
  });

  it("fill_in_blank: fallback '—' saat config rusak", () => {
    renderCard(
      makeQuestion({
        type: "fill_in_blank",
        options: [],
        correctOptionId: null,
        config: "{rusak" as unknown as QuestionConfig,
      }),
    );

    expect(screen.getByText("—")).toBeTruthy();
  });

  it("matching: menampilkan daftar pasangan benar", () => {
    renderCard(
      makeQuestion({
        type: "matching",
        options: [],
        correctOptionId: null,
        config: { pairs: [{ left: "H2O", right: "Air" }] },
      }),
    );

    expect(screen.getByText("Pasangkan")).toBeTruthy();
    expect(screen.getByText("Pasangan benar:")).toBeTruthy();
    expect(screen.getByText("H2O")).toBeTruthy();
    expect(screen.getByText("Air")).toBeTruthy();
  });

  it("sorting: menampilkan urutan benar bernomor", () => {
    renderCard(
      makeQuestion({
        type: "sorting",
        options: [],
        correctOptionId: null,
        config: { items: ["Telur", "Larva"], correctOrder: [0, 1] },
      }),
    );

    expect(screen.getByText("Urutkan")).toBeTruthy();
    expect(screen.getByText("Urutan benar:")).toBeTruthy();
    expect(screen.getByText("Telur")).toBeTruthy();
    expect(screen.getByText("Larva")).toBeTruthy();
  });
});

describe("QuestionCard — aksi edit/hapus", () => {
  it("memanggil onEdit dan onDelete saat tombol aksi diklik", () => {
    const { onEdit, onDelete } = renderCard(makeQuestion());

    fireEvent.click(screen.getByRole("button", { name: "Edit soal 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus soal 1" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("menonaktifkan kedua aksi saat `disabled` (ujian terkunci)", () => {
    const { onEdit, onDelete } = renderCard(makeQuestion(), { disabled: true });

    const editButton = screen.getByRole("button", { name: "Edit soal 1" });
    const deleteButton = screen.getByRole("button", { name: "Hapus soal 1" });
    expect((editButton as HTMLButtonElement).disabled).toBe(true);
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(editButton);
    fireEvent.click(deleteButton);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
