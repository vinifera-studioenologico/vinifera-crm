import { getPackages } from "@/server/actions/packages";
import { PackagesClient } from "./_components/PackagesClient";


export const dynamic = "force-dynamic";
export const metadata = { title: "Listino pacchetti — Vinifera" };

export default async function PackagesPage() {
  const data = await getPackages({ includeArchived: true });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PackagesClient initialData={data} />
    </div>
  );
}
