import { NewExpenseClient } from "../../_components/NewExpenseClient";
import { CostsBreadcrumb } from "../../_components/CostsBreadcrumb";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuova spesa — Vinifera" };

export default function NewExpensePage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <CostsBreadcrumb
          items={[
            { label: "Costi", href: "/costs" },
            { label: "Spese", href: "/costs/expenses" },
            { label: "Nuova spesa" },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold">Nuova spesa</h1>
      </div>

      <NewExpenseClient />
    </div>
  );
}
