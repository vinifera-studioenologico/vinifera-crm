import { getClients } from "@/server/actions/clients";
import { ClientsClient } from "./_components/ClientsClient";


export const dynamic = "force-dynamic";
export const metadata = { title: "Clienti — Vinifera" };

export default async function ClientsPage() {
  const result = await getClients({ includeArchived: true });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <ClientsClient initialData={result.items} />
    </div>
  );
}
