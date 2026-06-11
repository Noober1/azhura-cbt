import { describe, expect, it } from "vitest";
import { filenameFromContentDisposition } from "../download";

// Note: saveBlob() depends on `document` / URL.createObjectURL (browser-only)
// and is exercised by the E2E suite, not here (Node test environment).

describe("filenameFromContentDisposition", () => {
  it("returns the fallback when the header is undefined", () => {
    expect(filenameFromContentDisposition(undefined, "fallback.xlsx")).toBe("fallback.xlsx");
  });

  it("returns the fallback when the header has no filename directive", () => {
    expect(filenameFromContentDisposition("attachment", "fallback.xlsx")).toBe("fallback.xlsx");
  });

  it("extracts a quoted filename", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="rekap-ujian.xlsx"', "fallback.xlsx"),
    ).toBe("rekap-ujian.xlsx");
  });

  it("extracts an unquoted filename", () => {
    expect(
      filenameFromContentDisposition("attachment; filename=rekap.csv", "fallback.csv"),
    ).toBe("rekap.csv");
  });

  it("extracts and percent-decodes an RFC 5987 (filename*) value", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=UTF-8''rekap%20ujian.xlsx",
        "fallback.xlsx",
      ),
    ).toBe("rekap ujian.xlsx");
  });

  it("matches the filename directive case-insensitively", () => {
    expect(
      filenameFromContentDisposition('attachment; FileName="kartu.pdf"', "fallback.pdf"),
    ).toBe("kartu.pdf");
  });
});
