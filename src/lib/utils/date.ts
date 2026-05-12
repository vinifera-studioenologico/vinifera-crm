import {
  format,
  parseISO,
  isValid,
  addDays,
  addMonths,
  addWeeks,
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
 * Formatta un Timestamp Firestore come data italiana gg/mm/aaaa.
 */
export function formatDate(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : tsToDate(ts);
  return format(toZonedTime(d, TZ), "dd/MM/yyyy", { locale: it });
}

/**
 * Formatta un Timestamp Firestore come data e ora italiana.
 */
export function formatDateTime(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : tsToDate(ts);
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

export function generateDueDates(
  startDate: string, // "yyyy-MM-dd"
  n: number,
  recurrence: RecurrenceType,
  customDays?: number,
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
      case "custom":
        current = fromZonedTime(addDays(toZonedTime(current, TZ), customDays ?? 30), TZ);
        break;
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
