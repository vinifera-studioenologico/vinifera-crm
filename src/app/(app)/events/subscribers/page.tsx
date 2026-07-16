import { getEventSubscribers } from "@/server/actions/subscribers";
import { SubscribersClient } from "./_components/SubscribersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Iscritti mailing list — Vinifera" };

export default async function SubscribersPage() {
  const subscribers = await getEventSubscribers();
  return <SubscribersClient initialData={subscribers} />;
}
