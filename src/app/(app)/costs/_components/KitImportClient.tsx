"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { KitImportPreparation } from "@/server/actions/costs";
import type { ParsedOffer } from "@/app/api/costs/parse-offer/route";
import type { AnalysisDoc } from "@/schemas/analysis";
import { KitOfferUploader } from "./KitOfferUploader";
import { KitImportReview } from "./KitImportReview";

interface Props {
  analyses: AnalysisDoc[];
}

export function KitImportClient({ analyses }: Props) {
  const router = useRouter();
  const [importPrep, setImportPrep] = useState<KitImportPreparation | null>(null);
  const [importOffer, setImportOffer] = useState<ParsedOffer | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);

  function handleReady(prep: KitImportPreparation, offer: ParsedOffer, file: File | null) {
    setImportPrep(prep);
    setImportOffer(offer);
    setImportFile(file);
  }

  function handleClear() {
    setImportPrep(null);
    setImportOffer(null);
    setImportFile(null);
  }

  if (importPrep && importOffer) {
    return (
      <KitImportReview
        preparation={importPrep}
        parsedOffer={importOffer}
        file={importFile}
        analyses={analyses}
        onClose={() => router.push("/costs/kits")}
      />
    );
  }

  return (
    <KitOfferUploader
      onReady={handleReady}
      onClear={handleClear}
    />
  );
}
