import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getExpense, getExpensePdfUrl, getKits } from "@/server/actions/costs";
import { ExpenseForm } from "@/components/forms/ExpenseForm";
import { InvoicePdfViewer } from "../../_components/InvoicePdfViewer";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExpenseDetailPage({ params }: Props) {
  const { id } = await params;
  const expense = await getExpense(id);
  if (!expense) notFound();

  const pdfUrl = expense.pdfStoragePath
    ? await getExpensePdfUrl(expense.pdfStoragePath)
    : null;

  // Kit collegati (solo per spese kit_purchase)
  let linkedKits: { id: string; name: string; analysisCodeSnapshot: string | null; analysisNameSnapshot: string | null }[] = [];
  if (expense.category === "kit_purchase" && expense.linkedKitIds?.length) {
    const allKits = await getKits();
    linkedKits = allKits
      .filter((k) => expense.linkedKitIds!.includes(k.id))
      .map((k) => ({
        id: k.id,
        name: k.name,
        analysisCodeSnapshot: k.analysisCodeSnapshot,
        analysisNameSnapshot: k.analysisNameSnapshot,
      }));
  }

  const ext = expense.pdfStoragePath?.split(".").pop() ?? "pdf";

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>Costi</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Link href="/costs/expenses" className="hover:underline">
                Spese
              </Link>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{expense.description}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-2 text-2xl font-semibold">{expense.description}</h1>
      </div>

      <div className="space-y-8">
        <ExpenseForm existing={expense} />
        <div className="space-y-3">
          <p className="text-sm font-medium">Documento allegato</p>
          <InvoicePdfViewer
            pdfUrl={pdfUrl}
            fileName={`bolla-${expense.invoiceNumber ?? id}.${ext}`}
            storagePath={expense.pdfStoragePath ?? null}
          />
        </div>
      </div>

      {/* Kit collegati (tracciabilità offerta kit) */}
      {linkedKits.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Kit collegati</p>
          <div className="rounded-xl border border-border divide-y divide-border text-sm">
            {linkedKits.map((kit) => (
              <div key={kit.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="font-medium">{kit.name}</span>
                <Link
                  href="/costs/kits"
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  {kit.analysisCodeSnapshot} — {kit.analysisNameSnapshot}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
