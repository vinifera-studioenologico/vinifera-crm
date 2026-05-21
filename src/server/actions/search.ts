"use server";

import { globalSearch } from "@/lib/search";
import type { GlobalSearchResults } from "@/lib/search";

/**
 * Server Action che espone globalSearch ai Client Components.
 * La funzione gira sul server — il client invia solo la stringa query.
 */
export async function searchGlobal(query: string): Promise<GlobalSearchResults> {
  return globalSearch(query);
}
