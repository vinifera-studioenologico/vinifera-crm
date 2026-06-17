import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getCostsSettings } from "@/server/actions/costs";
import { CostsSettingsForm } from "@/components/forms/CostsSettingsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impostazioni costi — Vinifera" };

export default async function CostsSettingsPage() {
  const settings = await getCostsSettings();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>Costi</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Impostazioni</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-2 text-2xl font-semibold">Impostazioni costi</h1>
        <p className="text-sm text-muted-foreground">
          Parametri usati per i calcoli di marginalità e pricing suggerito.
        </p>
      </div>

      <CostsSettingsForm defaultValues={settings} />
    </div>
  );
}
