"use client";

import { Component, type ReactNode } from "react";
import { logger } from "@/lib/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// L'assistente è montato globalmente nel layout dell'app: se qualcosa al suo
// interno esplode a runtime, questo boundary lo isola in modo che non si
// porti giù l'intera app per tutte le pagine — fallisce in silenzio, il
// resto del CRM resta utilizzabile.
export class AssistantErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    logger.error("Assistente AI: errore runtime, disattivato per questa sessione", error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
