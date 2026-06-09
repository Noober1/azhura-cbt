/**
 * Azhura CBT Backend — Spreadsheet import/export utilities.
 *
 * Provides:
 *  - `parseSpreadsheet` — reads a .xlsx or .csv File into row objects
 *  - `generateTemplateXlsx` — builds an empty template workbook buffer
 *  - `generateTemplateCsv`  — builds a plain-text CSV template string
 *
 * Uses the existing `exceljs` dependency (same package as recap-export).
 */

import ExcelJS from "exceljs";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";

/** Parse a single CSV line, handling double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parses an `.xlsx` or `.csv` File into an array of row objects.
 *
 * The first row is treated as the header; column names are lowercased and
 * trimmed. Completely empty rows are skipped. Extra columns are ignored.
 * Returns `{ rows }` on success or `{ rows: [], error }` on format error.
 */
export async function parseSpreadsheet(
  file: File
): Promise<{ rows: Record<string, string>[]; error?: string }> {
  const name = file.name.toLowerCase();
  const ab = await file.arrayBuffer();
  const buffer = Buffer.from(ab);

  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    // Pass ArrayBuffer directly to avoid the bun-types Buffer<ArrayBuffer>/node Buffer mismatch.
    await wb.xlsx.load(ab as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount < 1) {
      return { rows: [], error: "File xlsx kosong atau tidak memiliki sheet." };
    }

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell: ExcelJS.Cell) =>
      headers.push(String(cell.value ?? "").trim().toLowerCase())
    );

    const rows: Record<string, string>[] = [];
    ws.eachRow((row: ExcelJS.Row, rowNumber: number) => {
      if (rowNumber === 1) return;
      const obj: Record<string, string> = {};
      let hasValue = false;
      row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell, colNumber: number) => {
        const key = headers[colNumber - 1];
        if (!key) return;
        // For formula cells, use the cached result value.
        const raw =
          cell.type === ExcelJS.ValueType.Formula
            ? String((cell as ExcelJS.Cell & { result?: unknown }).result ?? "")
            : String(cell.value ?? "");
        const val = raw.trim();
        obj[key] = val;
        if (val) hasValue = true;
      });
      if (hasValue) rows.push(obj);
    });
    return { rows };
  }

  if (name.endsWith(".csv")) {
    const content = buffer.toString("utf-8");
    const lines = content.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    if (lines.length < 1) return { rows: [], error: "File CSV kosong." };

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      const obj: Record<string, string> = {};
      let hasValue = false;
      headers.forEach((h, idx) => {
        const val = cells[idx]?.trim() ?? "";
        obj[h] = val;
        if (val) hasValue = true;
      });
      if (hasValue) rows.push(obj);
    }
    return { rows };
  }

  return {
    rows: [],
    error: "Format tidak didukung. Gunakan file .xlsx atau .csv.",
  };
}

/**
 * Generates a template `.xlsx` workbook buffer with the given headers and an
 * optional example row. Headers are rendered bold with a light grey fill.
 */
export async function generateTemplateXlsx(
  headers: string[],
  example?: Record<string, string>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Template");

  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell: ExcelJS.Cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFF2F7" },
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
    cell.alignment = { horizontal: "center" };
  });

  if (example) {
    ws.addRow(headers.map((h) => example[h] ?? ""));
  }

  headers.forEach((_, i) => {
    ws.getColumn(i + 1).width = 22;
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Generates a template CSV string with the given headers and an optional
 * example row. Cells are not quoted (template headers contain no commas).
 */
export function generateTemplateCsv(
  headers: string[],
  example?: Record<string, string>
): string {
  const lines = [headers.join(",")];
  if (example) {
    lines.push(headers.map((h) => example[h] ?? "").join(","));
  }
  return lines.join("\n");
}
