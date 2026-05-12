import { getDashboardStats } from "@/server/actions/stats";
import { DashboardClient } from "./_components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  return (
    <div className="p-4 md:p-6">
      <DashboardClient stats={stats} />
    </div>
  );
}
