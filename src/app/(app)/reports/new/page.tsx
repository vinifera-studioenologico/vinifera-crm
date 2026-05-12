import { getSamples } from "@/server/actions/samples";
import { getClients } from "@/server/actions/clients";
import { NewReportForm } from "@/components/forms/NewReportForm";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function NewReportPage() {
  const [clientsResult, completedSamplesResult] = await Promise.all([
    getClients(),
    getSamples({ status: "completed" }),
  ]);

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto space-y-6">
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>
                <Link href="/reports" className="hover:text-foreground transition-colors">
                  Referti
                </Link>
              </BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Nuovo referto</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Nuovo referto
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seleziona i campioni completati per generare il PDF del referto.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <NewReportForm
          clients={clientsResult.items}
          completedSamples={completedSamplesResult.items}
        />
      </div>
    </div>
  );
}
