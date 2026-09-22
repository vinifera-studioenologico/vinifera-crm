import { getExpensesBreakdown } from "@/server/actions/stats";
import { ExpensesBreakdownClient } from "./_components/ExpensesBreakdownClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Spese per categoria — Vinifera" };

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function ExpensesBreakdownPage({ searchParams }: Props) {
  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = yearParam ? parseInt(yearParam, 10) : currentYear;
  const selectedYear = Number.isFinite(year) && year > 2000 ? year : currentYear;

  const breakdown = await getExpensesBreakdown(selectedYear);

  return (
    <div className="p-4 md:p-6">
      <ExpensesBreakdownClient
        breakdown={breakdown}
        selectedYear={selectedYear}
        currentYear={currentYear}
      />
    </div>
  );
}
