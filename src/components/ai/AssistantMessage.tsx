"use client";

import type { ReactNode } from "react";
import Link from "next/link";

// Whitelist delle rotte del CRM — §3.5 di docs/assistente-ai.md. Un href che
// non inizia con "/" o il cui primo segmento non è qui dentro si rende come
// testo semplice, mai come link cliccabile: evita link rotti se il modello
// sbaglia un id o inventa una rotta.
const ROUTE_WHITELIST = [
  "clients",
  "samples",
  "quotes",
  "reports",
  "payments",
  "analyses",
  "reminders",
  "packages",
  "costs",
  "stats",
  "leads",
  "obiettivi",
  "events",
  "dashboard",
  "servizi",
  "support",
  "settings",
  "search",
];

function isAllowedHref(href: string): boolean {
  if (!href.startsWith("/")) return false;
  const firstSegment = href.slice(1).split("/")[0];
  return ROUTE_WHITELIST.includes(firstSegment ?? "");
}

// **grassetto** oppure [testo](/rotta) — inline, non annidato
const INLINE_PATTERN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

function renderInline(text: string, keyPrefix: string, onNavigate: () => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      // grassetto
      nodes.push(<strong key={`${keyPrefix}-b-${i++}`}>{match[1]}</strong>);
    } else {
      const label = match[2] ?? "";
      const href = match[3] ?? "";
      if (isAllowedHref(href)) {
        nodes.push(
          <Link
            key={`${keyPrefix}-l-${i++}`}
            href={href}
            onClick={onNavigate}
            className="text-primary underline underline-offset-2 hover:no-underline"
          >
            {label}
          </Link>,
        );
      } else {
        // href non in whitelist: mostra solo il testo, mai un link cliccabile
        nodes.push(label);
      }
    }

    lastIndex = INLINE_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function AssistantMessage({ content, onNavigate }: { content: string; onNavigate: () => void }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList(key: string) {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-0.5">
        {listBuffer.map((item, idx) => (
          <li key={idx}>{renderInline(item, `${key}-${idx}`, onNavigate)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      listBuffer.push(trimmed.slice(2));
      return;
    }
    flushList(`ul-${idx}`);
    if (trimmed.length === 0) return;
    blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p-${idx}`, onNavigate)}</p>);
  });
  flushList("ul-end");

  return <div className="space-y-1.5 text-sm leading-relaxed [&_p]:m-0">{blocks}</div>;
}
