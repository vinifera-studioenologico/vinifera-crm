import { describe, it, expect } from "vitest";
import {
  groupExpensesByCategoryMonthly,
  computeExpensesBreakdown,
  groupInstallmentsByMethod,
  type ExpenseRow,
} from "@/lib/calc/expenses-breakdown";

describe("groupExpensesByCategoryMonthly", () => {
  it("returns all 12 months and all 7 categories even when empty", () => {
    const result = groupExpensesByCategoryMonthly([], 2026);
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({
      month: "Gen",
      supplier_invoice: 0,
      utility: 0,
      maintenance: 0,
      consumable: 0,
      kit_purchase: 0,
      fixed_cost: 0,
      other: 0,
    });
  });

  it("sums same-category expenses in the same month", () => {
    const rows: ExpenseRow[] = [
      { category: "utility", totalCents: 5000, date: "2026-03-10" },
      { category: "utility", totalCents: 3000, date: "2026-03-20" },
    ];
    const result = groupExpensesByCategoryMonthly(rows, 2026);
    expect(result[2]!.utility).toBe(8000); // Mar = index 2
  });

  it("excludes expenses from other years", () => {
    const rows: ExpenseRow[] = [
      { category: "utility", totalCents: 5000, date: "2025-03-10" },
      { category: "utility", totalCents: 3000, date: "2027-03-10" },
    ];
    const result = groupExpensesByCategoryMonthly(rows, 2026);
    expect(result[2]!.utility).toBe(0);
  });

  it("keeps categories independent within the same month", () => {
    const rows: ExpenseRow[] = [
      { category: "utility", totalCents: 5000, date: "2026-06-01" },
      { category: "other", totalCents: 1000, date: "2026-06-15" },
    ];
    const result = groupExpensesByCategoryMonthly(rows, 2026);
    expect(result[5]!.utility).toBe(5000);
    expect(result[5]!.other).toBe(1000);
    expect(result[5]!.maintenance).toBe(0);
  });
});

describe("computeExpensesBreakdown", () => {
  it("returns empty breakdown for no expenses", () => {
    const result = computeExpensesBreakdown([]);
    expect(result).toEqual({ totalCents: 0, categories: [] });
  });

  it("groups by category then by subcategory, sorted descending", () => {
    const rows: ExpenseRow[] = [
      { category: "utility", subcategory: "Acqua", totalCents: 1000, date: "2026-01-01" },
      { category: "utility", subcategory: "Luce", totalCents: 3000, date: "2026-01-02" },
      { category: "supplier_invoice", subcategory: "Altro fornitore", totalCents: 500, date: "2026-01-03" },
    ];
    const result = computeExpensesBreakdown(rows);
    expect(result.totalCents).toBe(4500);
    expect(result.categories[0]!.category).toBe("utility"); // 4000 > 500, listed first
    expect(result.categories[0]!.totalCents).toBe(4000);
    expect(result.categories[0]!.subcategories[0]).toEqual({ key: "Luce", totalCents: 3000 });
    expect(result.categories[0]!.subcategories[1]).toEqual({ key: "Acqua", totalCents: 1000 });
    expect(result.categories[1]!.category).toBe("supplier_invoice");
  });

  it("buckets expenses without subcategory under the empty key", () => {
    const rows: ExpenseRow[] = [
      { category: "other", totalCents: 200, date: "2026-01-01" },
      { category: "other", subcategory: "", totalCents: 100, date: "2026-01-02" },
    ];
    const result = computeExpensesBreakdown(rows);
    expect(result.categories[0]!.subcategories).toEqual([{ key: "", totalCents: 300 }]);
  });

  it("excludes categories that net to zero", () => {
    // Non dovrebbe accadere con importi reali (>=0), ma verifica il filtro >0
    const rows: ExpenseRow[] = [{ category: "utility", totalCents: 0, date: "2026-01-01" }];
    const result = computeExpensesBreakdown(rows);
    expect(result.categories).toHaveLength(0);
  });
});

describe("groupInstallmentsByMethod", () => {
  it("sums amounts per known method", () => {
    const result = groupInstallmentsByMethod([
      { method: "cash", amountCents: 1000 },
      { method: "cash", amountCents: 500 },
      { method: "bank_transfer", amountCents: 2000 },
    ]);
    expect(result).toEqual([
      { method: "bank_transfer", totalCents: 2000 },
      { method: "cash", totalCents: 1500 },
    ]);
  });

  it("buckets missing or unknown method as unspecified, not dropped", () => {
    const result = groupInstallmentsByMethod([
      { method: null, amountCents: 1000 },
      { amountCents: 500 },
      { method: "somehow_invalid", amountCents: 200 },
    ]);
    expect(result).toEqual([{ method: "unspecified", totalCents: 1700 }]);
  });

  it("returns empty array for no installments", () => {
    expect(groupInstallmentsByMethod([])).toEqual([]);
  });
});
