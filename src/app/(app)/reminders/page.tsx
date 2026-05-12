import { getReminders } from "@/server/actions/reminders";
import { RemindersClient } from "./_components/RemindersClient";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const { items } = await getReminders();

  return (
    <div className="p-4 md:p-6">
      <RemindersClient initialData={items} />
    </div>
  );
}
