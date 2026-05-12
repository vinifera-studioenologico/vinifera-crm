import { getReminders } from "@/server/actions/reminders";
import { getClient } from "@/server/actions/clients";
import { RemindersClient } from "@/app/(app)/reminders/_components/RemindersClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientRemindersPage({ params }: Props) {
  const { id } = await params;
  const [client, { items }] = await Promise.all([
    getClient(id),
    getReminders({ clientId: id }),
  ]);

  if (!client) notFound();

  return (
    <div className="p-4 md:p-6">
      <RemindersClient initialData={items} defaultClientId={id} />
    </div>
  );
}
