import { getServices } from "@/server/actions/services";
import { ServiziClient } from "./_components/ServiziClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Servizi — Vinifera" };

export default async function ServiziPage() {
  const data = await getServices({ includeArchived: true });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <ServiziClient initialData={data} />
    </div>
  );
}
