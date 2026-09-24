import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/server/ai/prompt";
import { ASSISTANT_TOOLS } from "@/server/ai/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(40),
});

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.error("ANTHROPIC_API_KEY non configurata");
    return NextResponse.json(
      { error: "Assistente AI non disponibile (chiave API mancante)" },
      { status: 503 },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const abortController = new AbortController();
  req.signal.addEventListener("abort", () => abortController.abort());

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      function send(event: StreamEvent) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // il consumer si è disconnesso — smetti di scrivere, non propagare
          closed = true;
        }
      }

      try {
        const runner = client.beta.messages.toolRunner({
          model: "claude-opus-5",
          max_tokens: 16000,
          output_config: { effort: "medium" },
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: ASSISTANT_TOOLS,
          messages: parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        });

        for await (const messageStream of runner) {
          if (abortController.signal.aborted) break;

          for await (const event of messageStream) {
            if (abortController.signal.aborted) break;
            if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
              send({ type: "tool", name: event.content_block.name });
            } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ type: "text", delta: event.delta.text });
            }
          }

          if (abortController.signal.aborted) break;

          const message = await messageStream.finalMessage();
          // Turno di uno strumento server-side sospeso — non pertinente qui (nessuno
          // strumento server-side è dichiarato), ma gestito per coerenza con l'SDK.
          if (message.stop_reason === "pause_turn") {
            runner.pushMessages({ role: "assistant", content: message.content });
          }
          if (message.stop_reason === "refusal") break;
        }

        if (!abortController.signal.aborted) send({ type: "done" });
      } catch (err) {
        if (abortController.signal.aborted) {
          // richiesta abortita dal client (pannello chiuso a metà risposta): nessun errore da mostrare
        } else if (err instanceof Anthropic.RateLimitError) {
          send({ type: "error", message: "Limite richieste AI raggiunto. Riprova tra qualche secondo." });
        } else if (err instanceof Anthropic.APIError) {
          logger.error("Errore API assistente AI", { status: err.status, message: err.message });
          send({ type: "error", message: "Errore del servizio AI. Riprova tra poco." });
        } else {
          logger.error("Errore imprevisto assistente AI", err);
          send({ type: "error", message: "Errore imprevisto. Riprova." });
        }
      } finally {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
