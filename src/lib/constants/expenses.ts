import type { ExpenseCategory } from "@/schemas/cost";
import type { PaymentMethod } from "@/schemas/payment";

/**
 * Etichette italiane delle categorie spesa. Fonte unica: prima duplicata in
 * ExpensesTable.tsx e ExpenseForm.tsx, ora importata da entrambi.
 */
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  supplier_invoice: "Bolla fornitore",
  utility: "Bolletta",
  maintenance: "Manutenzione",
  consumable: "Materiale consumo",
  kit_purchase: "Acquisto kit",
  fixed_cost: "Costo fisso",
  other: "Altro",
};

/**
 * Le 7 categorie, derivate da CATEGORY_LABELS invece che riscritte a mano:
 * un `Record<ExpenseCategory, ...>` come CATEGORY_LABELS/CATEGORY_COLORS
 * forza il compilatore a segnalare una categoria mancante, un array
 * hardcoded no — aggiungerne una qui non farebbe più sparire silenziosamente
 * dal grafico mensile chi dimentica di aggiornare l'elenco a parte.
 */
export const ALL_EXPENSE_CATEGORIES = Object.keys(CATEGORY_LABELS) as ExpenseCategory[];

/**
 * Sottocategorie per categoria. Tassonomia generata dallo storico reale delle
 * spese (mesi di attività), non da un elenco teorico: per "utility" e
 * "supplier_invoice" le voci ricalcano i fornitori/tipi di bolletta che
 * compaiono davvero nei dati (acqua/EA, luce/Sorgenia, wifi/Vodafone,
 * materiale laboratorio/Steroglass, attrezzature enologiche, sponsorizzazioni).
 * "Immondizia" resta in elenco pur senza riscontro nei dati perché il
 * cliente l'ha nominata esplicitamente nella richiesta originale. Le
 * categorie senza spese storiche (maintenance, fixed_cost) usano una
 * tassonomia generica ragionevole, non essendoci dati da cui derivarla.
 * Le categorie vuote (nessun array) non mostrano il campo sottocategoria.
 *
 * "other" aggiunta il 2026-09-23, non alla generazione iniziale: era vuota
 * per decisione del documento originale, ma a consuntivo pesava il 14% della
 * spesa 2026 (637€) con dentro un mix reale — commercialista, un piccolo
 * elettrodomestico, capsule caffè — troppo eterogeneo per restare un'unica
 * fetta opaca nel grafico. Stesso criterio delle altre: solo voci con
 * riscontro nei dati, più un residuale "Altro".
 */
export const SUBCATEGORIES_BY_CATEGORY: Record<ExpenseCategory, string[]> = {
  supplier_invoice: ["Materiale e attrezzature laboratorio", "Sponsorizzazioni e marketing", "Altro fornitore"],
  utility: ["Acqua", "Luce", "Internet e telefonia", "Immondizia", "Altro"],
  maintenance: ["Strumenti", "Locali", "Software"],
  consumable: [],
  kit_purchase: [],
  fixed_cost: ["Affitto", "Assicurazione", "Commercialista", "Abbonamenti e servizi", "Compensi"],
  other: ["Servizi professionali", "Forniture e attrezzature ufficio", "Altro"],
};

export const UNSPECIFIED_SUBCATEGORY_LABEL = "Non specificata";

/**
 * Palette per categoria — un colore per tutti i grafici (mensile e torte),
 * stessa categoria stesso colore ovunque. Coppie light/dark validate con lo
 * strumento della skill dataviz (categorical, 7 slot in ordine fisso — CVD
 * ΔE >= 8.4, normal-vision ΔE >= 19.3 sul confine più stretto, entrambi i
 * temi): `node scripts/validate_palette.js "<hex...>" --mode light|dark`.
 * Il contrasto sotto 3:1 di tre colori in chiaro (relief rule) è coperto dal
 * fatto che l'identità non è mai affidata al solo colore — legenda e
 * tooltip riportano sempre l'etichetta testuale.
 */
export const CATEGORY_COLORS: Record<ExpenseCategory, { light: string; dark: string }> = {
  supplier_invoice: { light: "#2a78d6", dark: "#3987e5" }, // blu
  utility: { light: "#eb6834", dark: "#d95926" }, // arancio
  maintenance: { light: "#1baf7a", dark: "#199e70" }, // acqua
  consumable: { light: "#eda100", dark: "#c98500" }, // giallo
  kit_purchase: { light: "#e87ba4", dark: "#d55181" }, // magenta
  fixed_cost: { light: "#008300", dark: "#008300" }, // verde
  other: { light: "#4a3aa7", dark: "#9085e9" }, // viola
};

export type PaymentMethodOrUnspecified = PaymentMethod | "unspecified";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodOrUnspecified, string> = {
  cash: "Contanti",
  bank_transfer: "Bonifico",
  card: "Carta",
  other: "Altro",
  unspecified: "Non specificato",
};

/**
 * Stessa palette validata, riusata dallo slot 1 (dimensione diversa dalle
 * categorie spesa — nessun conflitto di identità: titolo e legenda separano
 * sempre i due grafici). "unspecified" non è un metodo reale ma un buco nei
 * dati: colore neutro (muted, invariato fra i due temi) invece di un hue
 * categorico, per non fargli impersonare una vera categoria.
 */
export const PAYMENT_METHOD_COLORS: Record<PaymentMethodOrUnspecified, { light: string; dark: string }> = {
  cash: { light: "#2a78d6", dark: "#3987e5" },
  bank_transfer: { light: "#eb6834", dark: "#d95926" },
  card: { light: "#1baf7a", dark: "#199e70" },
  other: { light: "#eda100", dark: "#c98500" },
  unspecified: { light: "#898781", dark: "#898781" },
};
