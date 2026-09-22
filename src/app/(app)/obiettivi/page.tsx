import { getGoal, getGoalProgress, getGoalYears } from "@/server/actions/goals";
import { ObiettiviClient } from "./_components/ObiettiviClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Obiettivi — Vinifera" };

export default async function ObiettiviPage() {
  const currentYear = new Date().getFullYear();

  const [currentGoal, currentProgress, goalYears] = await Promise.all([
    getGoal(currentYear),
    getGoalProgress(currentYear),
    getGoalYears(),
  ]);

  const historicalYears = goalYears.filter((y) => y !== currentYear);
  const historicalProgress = await Promise.all(
    historicalYears.map((y) => getGoalProgress(y)),
  );

  return (
    <div className="p-4 md:p-6">
      <ObiettiviClient
        currentYear={currentYear}
        currentGoal={currentGoal}
        currentProgress={currentProgress}
        historicalProgress={historicalProgress}
      />
    </div>
  );
}
