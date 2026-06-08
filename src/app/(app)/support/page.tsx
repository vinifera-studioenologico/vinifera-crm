import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { getCompanySettings } from "@/server/actions/settings";
import { SupportForm } from "./_components/SupportForm";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const company = await getCompanySettings().catch(() => null);

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Supporto</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Contattaci</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compila il modulo e ti risponderemo il prima possibile.
        </p>
      </div>

      <Separator className="my-6" />

      <SupportForm
        defaultName={company?.displayName ?? ""}
        defaultEmail={company?.email ?? ""}
        defaultPhone={company?.phone ?? ""}
      />
    </div>
  );
}
