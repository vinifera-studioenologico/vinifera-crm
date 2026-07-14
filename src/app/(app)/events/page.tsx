import { getEvents } from "@/server/actions/events";
import { EventsClient } from "./_components/EventsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Eventi — Vinifera" };

export default async function EventsPage() {
  const data = await getEvents({ includeArchived: true });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <EventsClient initialData={data} />
    </div>
  );
}
