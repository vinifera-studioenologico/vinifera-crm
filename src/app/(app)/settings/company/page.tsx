import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getCompanySettings } from "@/server/actions/settings";
import { CompanySettingsForm } from "@/components/forms/CompanySettingsForm";


export const dynamic = "force-dynamic";
export const metadata = {
  title: "Impostazioni azienda — Vinifera",
};

export default async function CompanySettingsPage() {
  const settings = await getCompanySettings();

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>Impostazioni</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Azienda</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Dati azienda
        </h1>
        <p className="text-sm text-muted-foreground">
          Questi dati appaiono nell&apos;intestazione di preventivi e referti PDF.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl border border-border bg-card p-6">
        <CompanySettingsForm defaultValues={settings ?? undefined} />
      </div>
    </div>
  );
}
