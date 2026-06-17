import { getExpenses } from "@/server/actions/costs";
import { ExpensesTable } from "../_components/ExpensesTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Spese — Vinifera" };

export default async function ExpensesPage() {
  const data = await getExpenses();
  return <ExpensesTable initialData={data} />;
}
