import { describe, it, expect } from "vitest";
import { generateCsvString, type CsvColumn } from "./csv";

interface Row {
  name: string;
  amount: number;
  note?: string;
}

const cols: CsvColumn<Row>[] = [
  { header: "Nome", accessor: (r) => r.name },
  { header: "Importo", accessor: (r) => (r.amount / 100).toFixed(2).replace(".", ",") },
  { header: "Note", accessor: (r) => r.note ?? "" },
];

describe("generateCsvString", () => {
  it("produces correct header line", () => {
    const csv = generateCsvString([], cols);
    expect(csv.split("\r\n")[0]).toBe("Nome;Importo;Note");
  });

  it("uses ; as separator", () => {
    const csv = generateCsvString([{ name: "Alfa", amount: 1000 }], cols);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toBe("Alfa;10,00;");
  });

  it("returns only header when data is empty", () => {
    const csv = generateCsvString([], cols);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("Nome;Importo;Note");
  });

  it("escapes cells containing ;", () => {
    const csv = generateCsvString([{ name: "A;B", amount: 0 }], cols);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.startsWith('"A;B"')).toBe(true);
  });

  it("escapes cells containing double quotes", () => {
    const csv = generateCsvString([{ name: 'A"B', amount: 0 }], cols);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.startsWith('"A""B"')).toBe(true);
  });

  it("escapes cells containing newlines", () => {
    const csv = generateCsvString([{ name: "A\nB", amount: 0 }], cols);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.startsWith('"A\nB"')).toBe(true);
  });

  it("uses Italian decimal format for monetary values", () => {
    const csv = generateCsvString([{ name: "X", amount: 123456 }], cols);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toContain("1234,56");
  });

  it("uses CRLF line endings", () => {
    const csv = generateCsvString([{ name: "X", amount: 0 }], cols);
    expect(csv).toContain("\r\n");
  });
});
