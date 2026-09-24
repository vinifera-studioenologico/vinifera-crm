"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Square, Sparkles, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AssistantMessage } from "@/components/ai/AssistantMessage";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const TOOL_LABELS: Record<string, string> = {
  search_global: "Cerco nel gestionale…",
  get_client: "Consulto il cliente…",
  list_clients: "Consulto i clienti…",
  list_samples: "Consulto i campioni…",
  get_sample: "Consulto il campione…",
  list_payments: "Consulto i pagamenti…",
  list_quotes: "Consulto i preventivi…",
  list_reminders: "Consulto i promemoria…",
  list_analyses_catalog: "Consulto il catalogo analisi…",
  list_expenses: "Consulto le spese…",
  get_stats_summary: "Consulto le statistiche…",
};

const EXAMPLE_QUESTIONS = [
  "Quanto mi deve ancora la cantina Rossi?",
  "Quali campioni sono in lavorazione da più di una settimana?",
  "Quanto ho incassato questo mese?",
  "Che rate sono scadute?",
];

function newId() {
  return Math.random().toString(36).slice(2);
}

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

export function AssistantPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, activeTool]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setActiveTool(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || sending) return;

      setError(null);
      const userMessage: ChatMessage = { id: newId(), role: "user", content: question };
      const assistantId = newId();
      const history = [...messages, userMessage];
      setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
      setInput("");
      setSending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => null);
          throw new Error((body?.error as string) ?? "Errore del servizio AI. Riprova.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as StreamEvent;

            if (event.type === "text") {
              setActiveTool(null);
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + event.delta } : m)),
              );
            } else if (event.type === "tool") {
              setActiveTool(event.name);
            } else if (event.type === "error") {
              setError(event.message);
            }
            // "done" non richiede azione: lo stream si chiude comunque
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Errore imprevisto. Riprova.");
        }
      } finally {
        setSending(false);
        setActiveTool(null);
        abortRef.current = null;
      }
    },
    [messages, sending],
  );

  function handlePanelChange(next: boolean) {
    if (!next) stopStreaming();
    onOpenChange(next);
  }

  function closeOnNavigate() {
    stopStreaming();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={handlePanelChange}>
      <SheetContent side="right" className="flex flex-col p-0 gap-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" strokeWidth={1.75} />
            Assistente AI
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-4 px-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Chiedimi qualunque cosa sui dati del gestionale — clienti, campioni, pagamenti,
                  preventivi. Cito sempre le entità con un link cliccabile.
                </p>
                <div className="flex flex-col gap-2">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="text-left text-sm rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted transition-colors motion-reduce:transition-none"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[90%] rounded-xl px-3 py-2",
                  m.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start bg-muted text-foreground",
                )}
              >
                {m.role === "assistant" ? (
                  m.content ? (
                    <AssistantMessage content={m.content} onNavigate={closeOnNavigate} />
                  ) : (
                    <span className="sr-only">In attesa di risposta</span>
                  )
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            ))}

            {sending && (
              <div className="self-start flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                {activeTool ? (TOOL_LABELS[activeTool] ?? "Sto elaborando…") : "Sto scrivendo…"}
              </div>
            )}

            {error && (
              <div className="self-start max-w-[90%] rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div ref={scrollBottomRef} />
          </div>
        </ScrollArea>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="border-t border-border p-3 flex items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Scrivi una domanda…"
            className="min-h-11 max-h-40 flex-1 resize-none"
            disabled={sending}
          />
          {sending ? (
            <Button type="button" variant="outline" size="icon" onClick={stopStreaming} aria-label="Ferma la risposta">
              <Square className="size-4" strokeWidth={1.75} />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Invia">
              <Send className="size-4" strokeWidth={1.75} />
            </Button>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
