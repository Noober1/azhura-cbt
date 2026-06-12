/**
 * question-display — helper bersama tampilan soal (admin + supervisor).
 * `parseConfig` harus toleran terhadap nilai kosong, string JSON mentah dari
 * API, JSON rusak, dan objek yang sudah ter-parse; `QUESTION_TYPE_LABELS`
 * harus lengkap untuk keempat tipe soal.
 */
import { describe, expect, it } from "vitest";
import type { FillInBlankConfig, MatchingConfig, QuestionType } from "@azhura/shared";
import { parseConfig, QUESTION_TYPE_LABELS } from "../question-display";

describe("parseConfig", () => {
  it("mengembalikan null untuk nilai kosong (null/undefined/string kosong)", () => {
    expect(parseConfig<FillInBlankConfig>(null)).toBeNull();
    expect(parseConfig<FillInBlankConfig>(undefined)).toBeNull();
    expect(parseConfig<FillInBlankConfig>("")).toBeNull();
  });

  it("mem-parse string JSON yang valid", () => {
    const parsed = parseConfig<FillInBlankConfig>('{"answer":"Jakarta"}');
    expect(parsed).toEqual({ answer: "Jakarta" });
  });

  it("mengembalikan null untuk string JSON yang rusak", () => {
    expect(parseConfig<FillInBlankConfig>("{jelas-bukan-json")).toBeNull();
  });

  it("meneruskan objek yang sudah ter-parse apa adanya", () => {
    const config: MatchingConfig = { pairs: [{ left: "Ibu kota", right: "Jakarta" }] };
    expect(parseConfig<MatchingConfig>(config)).toBe(config);
  });
});

describe("QUESTION_TYPE_LABELS", () => {
  const TYPES: QuestionType[] = ["multiple_choice", "fill_in_blank", "matching", "sorting"];

  it("punya label dan kelas badge untuk keempat tipe soal", () => {
    for (const type of TYPES) {
      const meta = QUESTION_TYPE_LABELS[type];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.className.length).toBeGreaterThan(0);
    }
  });

  it("memakai label Bahasa Indonesia yang sudah disepakati", () => {
    expect(QUESTION_TYPE_LABELS.multiple_choice.label).toBe("Pilihan Ganda");
    expect(QUESTION_TYPE_LABELS.fill_in_blank.label).toBe("Isi Jawaban");
    expect(QUESTION_TYPE_LABELS.matching.label).toBe("Pasangkan");
    expect(QUESTION_TYPE_LABELS.sorting.label).toBe("Urutkan");
  });
});
