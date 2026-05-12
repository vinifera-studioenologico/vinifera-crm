import { notFound } from "next/navigation";
import { getClient } from "@/server/actions/clients";
import { ClientDetailNav } from "./_components/ClientDetailNav";
import { ClientDetailHeader } from "./_components/ClientDetailHeader";

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ClientDetailLayout({ children, params }: Props) {
  const { id } = await params;
  const client = await getClient(id);

  if (!client) notFound();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <ClientDetailHeader client={client} />

      {/* Body: left nav + content */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail — visibile su md+ */}
        <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-border px-3 py-4">
          <ClientDetailNav clientId={id} />
        </aside>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
