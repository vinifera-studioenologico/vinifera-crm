export function currentYear(): number {
  return new Date().getFullYear();
}

export function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export function buildProgressiveCode(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${pad4(seq)}`;
}

export function buildQuoteNumber(year: number, seq: number): string {
  return `${year}/${pad4(seq)}`;
}
