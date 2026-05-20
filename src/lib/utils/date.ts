import {
  format,
  parseISO,
  isValid,
  addDays,
  addMonths,
  addWeeks,
  addYears,
  startOfDay,
  isBefore,
  isAfter,
} from "date-fns";
import { it } from "date-fns/locale";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import type { Timestamp } from "firebase/firestore";

export const TZ = "Europe/Rome";

/**
 * Converte un Timestamp Firestore in Date JS.
 */
export function tsToDate(ts: Timestamp): Date {
  return ts.toDate();
}

/**
 * Converte un valore Firestore Timestamp (client o admin SDK) in stringa ISO.
 * Restituisce undefined se il valore è null/undefined.
 * Usare nei mapper server-side prima di passare dati a Client Components.
 */
export function tsToISO(val: unknown): string | undefined {
  if (val == null) return undefined;
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    const v = val as Record<string, unknown>;
    if (typeof v["toDate"] === "function") {
      return (v["toDate"] as () => Date)().toISOString();
    }
    if (typeof v["_seconds"] === "number") {
      return new Date(v["_seconds"] * 1000).toISOString();
    }
  }
  return undefined;
}

/**
 * Formatta un Timestamp Firestore (o stringa ISO) come data italiana gg/mm/aaaa.
 */
export function formatDate(ts: Timestamp | Date | string | null | undefined): string {
  if (!ts) return "\u2014";
  let d: Date;
  if (typeof ts === "string") d = new Date(ts);
  else if (ts instanceof Date) d = ts;
  else d = tsToDate(ts);
  return format(toZonedTime(d, TZ), "dd/MM/yyyy", { locale: it });
}

/**
 * Formatta un Timestamp Firestore (o stringa ISO) come data e ora italiana.
 */
export function formatDateTime(ts: Timestamp | Date | string | null | undefined): string {
  if (!ts) return "\u2014";
  let d: Date;
  if (typeof ts === "string") d = new Date(ts);
  else if (ts instanceof Date) d = ts;
  else d = tsToDate(ts);
  return format(toZonedTime(d, TZ), "dd/MM/yyyy HH:mm", { locale: it });
}

/**
 * §18.4 — Date civili: converte una stringa "yyyy-MM-dd" (da <input type="date">)
 * nel Timestamp corrispondente alle 23:59:59.999 di Europe/Rome.
 * Questo garantisce che la scadenza "10 giugno" sia overdue solo dall'11 giugno ora IT.
 */
export function civilDateToEndOfDay(dateStr: string): Date {
  // parseISO restituisce midnight UTC — ne ignoreremo l'orario
  const parsed = parseISO(dateStr);
  if (!isValid(parsed)) throw new Error(`Data non valida: ${dateStr}`);

  // Fine giornata in Europe/Rome
  const endInRome = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    23,
    59,
    59,
    999,
  );
  // Convertiamo dall'ora locale di Roma a UTC
  return fromZonedTime(endInRome, TZ);
}

/**
 * Controlla se una data civile (Timestamp Firestore) è scaduta rispetto ad oggi.
 * §18.4: usa timezone Europe/Rome.
 */
export function isOverdue(dueDate: Timestamp | Date): boolean {
  const d = dueDate instanceof Date ? dueDate : tsToDate(dueDate);
  const nowInRome = toZonedTime(new Date(), TZ);
  const dueInRome = toZonedTime(d, TZ);
  return isBefore(dueInRome, startOfDay(nowInRome));
}

/**
 * Genera N date di scadenza a partire da `startDate`, con cadenza definita.
 * §18.4: usa addMonths/addDays/addWeeks (no aritmetica millis).
 */
export type RecurrenceType = "monthly" | "biweekly" | "weekly" | "custom";
export type CustomUnit = "days" | "months" | "years";

export function generateDueDates(
  startDate: string, // "yyyy-MM-dd"
  n: number,
  recurrence: RecurrenceType,
  customInterval?: number,
  customUnit?: CustomUnit,
): Date[] {
  const dates: Date[] = [];
  let current = civilDateToEndOfDay(startDate);

  for (let i = 0; i < n; i++) {
    dates.push(current);
    switch (recurrence) {
      case "monthly":
        current = fromZonedTime(addMonths(toZonedTime(current, TZ), 1), TZ);
        break;
      case "biweekly":
        current = fromZonedTime(addDays(toZonedTime(current, TZ), 15), TZ);
        break;
      case "weekly":
        current = fromZonedTime(addWeeks(toZonedTime(current, TZ), 1), TZ);
        break;
      case "custom": {
        const n = customInterval ?? 1;
        const unit = customUnit ?? "months";
        if (unit === "days") {
          current = fromZonedTime(addDays(toZonedTime(current, TZ), n), TZ);
        } else if (unit === "years") {
          current = fromZonedTime(addYears(toZonedTime(current, TZ), n), TZ);
        } else {
          current = fromZonedTime(addMonths(toZonedTime(current, TZ), n), TZ);
        }
        break;
      }
    }
  }

  return dates;
}

/**
 * Restituisce "yyyy-MM-dd" da una Date (per usare con <input type="date">).
 */
export function toInputDateString(d: Date | Timestamp): string {
  const date = d instanceof Date ? d : tsToDate(d);
  return format(toZonedTime(date, TZ), "yyyy-MM-dd");
}

export { isBefore, isAfter, addDays, addMonths };
