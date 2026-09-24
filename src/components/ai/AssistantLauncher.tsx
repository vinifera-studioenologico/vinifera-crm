"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AssistantPanel } from "@/components/ai/AssistantPanel";

export function AssistantLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Apri assistente AI"
        className="fixed z-40 bottom-24 right-4 md:bottom-6 md:right-6 size-14 rounded-full shadow-lg"
      >
        <Sparkles className="size-6" strokeWidth={1.75} />
      </Button>
      <AssistantPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
