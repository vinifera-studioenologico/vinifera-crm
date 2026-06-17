"use client";

import { ExternalLink, Download, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  pdfUrl: string | null;
  fileName?: string;
  storagePath?: string | null;
}

function isImage(fileName: string, storagePath?: string | null) {
  const src = storagePath ?? fileName;
  return /\.(jpe?g|png|webp)$/i.test(src);
}

export function InvoicePdfViewer({ pdfUrl, fileName = "bolla.pdf", storagePath }: Props) {
  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-8 text-muted-foreground">
        <FileText className="size-10 opacity-40" strokeWidth={1.25} />
        <p className="text-sm">Nessun documento allegato</p>
      </div>
    );
  }

  const image = isImage(fileName, storagePath);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <a
          href={pdfUrl}
          download={fileName}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <Download className="mr-2 size-3.5" />
          Scarica
        </a>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ExternalLink className="mr-2 size-3.5" />
          Apri in nuova tab
        </a>
      </div>
      <div className="rounded-xl border border-border overflow-hidden bg-muted/30">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pdfUrl}
            alt={fileName}
            className="w-full object-contain max-h-[600px]"
          />
        ) : (
          <iframe
            src={pdfUrl}
            className="w-full h-[600px]"
            title={fileName}
          />
        )}
      </div>
    </div>
  );
}
