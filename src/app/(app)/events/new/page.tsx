import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EventForm } from "../_components/EventForm";

export const metadata = { title: "Nuovo evento — Vinifera" };

export default function NewEventPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} />
          Tutti gli eventi
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Nuovo evento</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verrà creato in bozza. Potrai pubblicarlo dalla pagina di dettaglio.
        </p>
      </div>

      <EventForm />
    </div>
  );
}
