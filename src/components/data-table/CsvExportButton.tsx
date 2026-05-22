"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, type CsvColumn } from "@/lib/utils/csv";

interface Props<T> {
  data: T[];
  columns: CsvColumn<T>[];
  filenamePrefix: string;
  label?: string;
}

export function CsvExportButton<T>({
  data,
  columns,
  filenamePrefix,
  label = "Scarica CSV",
}: Props<T>) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => downloadCsv(data, columns, filenamePrefix)}
      disabled={data.length === 0}
    >
      <Download className="size-3.5" strokeWidth={1.75} />
      {label}
    </Button>
  );
}
