import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getEvent } from "@/server/actions/events";
import { EventDetailNav } from "../_components/EventDetailNav";

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function EventDetailLayout({ children, params }: Props) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) notFound();

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb + nav mobile */}
      <div className="border-b border-border bg-card px-4 pt-3 pb-0">
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.75} />
          Eventi
        </Link>
        <p className="font-semibold text-base mb-2 truncate">{event.title?.it || event.slug}</p>
        {/* Mobile tabs */}
        <div className="md:hidden">
          <EventDetailNav eventId={id} orientation="horizontal" />
        </div>
      </div>

      {/* Body: left nav + content */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail — md+ */}
        <aside className="hidden md:flex w-48 shrink-0 flex-col border-r border-border px-3 py-4">
          <EventDetailNav eventId={id} />
        </aside>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
