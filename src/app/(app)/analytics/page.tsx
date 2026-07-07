import { AnalyticsClient } from "./_components/AnalyticsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics — Vinifera" };

export default function AnalyticsPage() {
  return (
    <div className="p-4 md:p-6">
      <AnalyticsClient />
    </div>
  );
}
