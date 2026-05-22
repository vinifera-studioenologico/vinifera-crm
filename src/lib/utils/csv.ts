/**
 * CSV export utility — RFC 4180 compliant.
 *
 * Separator: ; (Italian Excel standard — comma is used as decimal separator)
 * Encoding:  UTF-8 with BOM (\uFEFF) — required for Excel on Windows
 */

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string;
}

/**
 * Generates the raw CSV string (without BOM).
 * Exported separately to make it unit-testable without DOM.
 */
export function generateCsvString<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const sep = ";";
  const headerLine = columns.map((c) => escapeCell(c.header)).join(sep);
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCell(c.accessor(row))).join(sep),
  );
  return [headerLine, ...dataLines].join("\r\n");
}

/**
 * Generates a CSV and triggers a browser download.
 *
 * @param rows           The data to export (should already be filtered).
 * @param columns        Column definitions with header labels and value accessors.
 * @param filenamePrefix e.g. "clienti" → file will be "clienti_2026-05-22.csv"
 */
export function downloadCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  filenamePrefix: string,
): void {
  const csv = "\uFEFF" + generateCsvString(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Escapes a single CSV cell value per RFC 4180.
 * Wraps in double-quotes if the value contains ; " \n or \r.
 * Internal double-quotes are doubled ("").
 */
function escapeCell(value: string): string {
  if (
    value.includes('"') ||
    value.includes(";") ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
