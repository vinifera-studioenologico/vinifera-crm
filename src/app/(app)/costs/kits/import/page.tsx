import { getAnalyses } from "@/server/actions/analyses";
import { CostsBreadcrumb } from "../../_components/CostsBreadcrumb";
import { KitImportClient } from "../../_components/KitImportClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importa kit da offerta — Vinifera" };

export default async function KitImportPage() {
  const analyses = await getAnalyses({ includeArchived: false });

  return (
    <div className="space-y-6">
      <div>
        <CostsBreadcrumb
          items={[
            { label: "Costi", href: "/costs" },
            { label: "Kit", href: "/costs/kits" },
            { label: "Importa da offerta" },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold">Importa kit da offerta fornitore</h1>
      </div>

      <KitImportClient analyses={analyses} />
    </div>
  );
}
