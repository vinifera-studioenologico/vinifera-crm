/**
 * Aggregazioni pure per statistiche spese/incassi (modulo #8 Parte C).
 * Nessuna dipendenza da Firestore: il chiamante (server action) passa righe
 * già lette e già filtrate su deletedAt/anno.
 */

import type { ExpenseCategory } from "@/schemas/cost";

const MONTHS_IT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const ALL_CATEGORIES: ExpenseCategory[] = [
  "supplier_invoice",
  "utility",
  "maintenance",
  "consumable",
  "kit_purchase",
  "fixed_cost",
  "other",
];

// ── Spese per categoria, per mese ──────────────────────────────────────
export interface ExpenseRow {
  category: ExpenseCategory;
  subcategory?: string | null;
  totalCents: number;
  date: string; // "YYYY-MM-DD"
}

export type ExpensesByMonthPoint = { month: string } & Record<ExpenseCategory, number>;

/**
 * Raggruppa le spese di un anno per mese e categoria (centesimi). Tutti i 12
 * mesi e tutte le 7 categorie sono sempre presenti (a 0 se assenti), così il
 * grafico ha linee complete invece che spezzoni sparsi.
 */
export function groupExpensesByCategoryMonthly(
  expenses: ExpenseRow[],
  year: number,
): ExpensesByMonthPoint[] {
  const points: ExpensesByMonthPoint[] = MONTHS_IT.map((month) => {
    const base = { month } as ExpensesByMonthPoint;
    for (const cat of ALL_CATEGORIES) base[cat] = 0;
    return base;
  });

  for (const e of expenses) {
    const y = parseInt(e.date.slice(0, 4), 10);
    if (y !== year) continue;
    const monthIndex = parseInt(e.date.slice(5, 7), 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;
    const point = points[monthIndex]!;
    point[e.category] = (point[e.category] ?? 0) + e.totalCents;
  }

  return points;
}

// ── Spese: totale per categoria e sottocategoria (torte) ────────────────
export interface SubcategoryTotal {
  key: string; // sottocategoria, o "" per "Non specificata"
  totalCents: number;
}

export interface CategoryBreakdown {
  category: ExpenseCategory;
  totalCents: number;
  subcategories: SubcategoryTotal[]; // ordinate per importo decrescente
}

export interface ExpensesBreakdown {
  totalCents: number;
  categories: CategoryBreakdown[]; // solo categorie con totale > 0, ordinate per importo decrescente
}

/**
 * Totali per categoria e, dentro ciascuna, per sottocategoria (bucket ""
 * incluso per le spese senza sottocategoria — "Non specificata" a livello UI).
 */
export function computeExpensesBreakdown(expenses: ExpenseRow[]): ExpensesBreakdown {
  const byCategory = new Map<ExpenseCategory, Map<string, number>>();

  for (const e of expenses) {
    const subKey = e.subcategory?.trim() || "";
    let subMap = byCategory.get(e.category);
    if (!subMap) {
      subMap = new Map();
      byCategory.set(e.category, subMap);
    }
    subMap.set(subKey, (subMap.get(subKey) ?? 0) + e.totalCents);
  }

  const categories: CategoryBreakdown[] = [...byCategory.entries()]
    .map(([category, subMap]) => {
      const subcategories = [...subMap.entries()]
        .map(([key, totalCents]) => ({ key, totalCents }))
        .sort((a, b) => b.totalCents - a.totalCents);
      const totalCents = subcategories.reduce((s, sc) => s + sc.totalCents, 0);
      return { category, totalCents, subcategories };
    })
    .filter((c) => c.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents);

  const totalCents = categories.reduce((s, c) => s + c.totalCents, 0);

  return { totalCents, categories };
}

// ── Incassi per metodo di pagamento ──────────────────────────────────────
export type PaymentMethodKey = "cash" | "bank_transfer" | "card" | "other" | "unspecified";

export interface InstallmentForMethod {
  method?: string | null;
  amountCents: number;
}

export interface IncomeByMethodRow {
  method: PaymentMethodKey;
  totalCents: number;
}

const KNOWN_METHODS: PaymentMethodKey[] = ["cash", "bank_transfer", "card", "other"];

/**
 * Somma gli importi incassati per metodo di pagamento. Le rate senza
 * `method` finiscono nel bucket "unspecified" invece di sparire, altrimenti
 * il totale del grafico non torna con "Entrate mensili" dello stesso anno.
 */
export function groupInstallmentsByMethod(installments: InstallmentForMethod[]): IncomeByMethodRow[] {
  const totals = new Map<PaymentMethodKey, number>();

  for (const inst of installments) {
    const key: PaymentMethodKey =
      inst.method && (KNOWN_METHODS as string[]).includes(inst.method)
        ? (inst.method as PaymentMethodKey)
        : "unspecified";
    totals.set(key, (totals.get(key) ?? 0) + inst.amountCents);
  }

  return [...totals.entries()]
    .map(([method, totalCents]) => ({ method, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents);
}
