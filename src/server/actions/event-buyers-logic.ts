/**
 * Logica pura per il raggruppamento acquirenti (union-find).
 * Nessuna dipendenza da Firestore — testabile con Vitest.
 */
import { normalizePhone } from "@/lib/events/normalize";

export interface OrderForHistory {
  id: string;
  status: "paid" | "refunded" | "cancelled";
  eventId: string;
  eventTitleIt: string;
  seats: number;
  totalCents: number;
  paidAt: unknown; // Timestamp | string | null
  createdAt: unknown;
  buyer: {
    firstName: string;
    lastName: string;
    emailNormalized: string;
    phoneNormalized: string;
  };
  historyConsent: { granted: boolean };
}

export interface BuyerGroup {
  id: string; // chiave univoca (root order id)
  displayName: string;
  emails: string[];
  phones: string[];
  orderCount: number;
  totalSeats: number;   // solo paid (non refunded/cancelled)
  totalSpentCents: number; // paid - refunded
  eventIds: string[];
  eventTitles: string[];
  orders: OrderForHistory[];
}

// ── Union-Find ─────────────────────────────────────────────────────────
function makeUnionFind(ids: string[]) {
  const parent = new Map<string, string>(ids.map((id) => [id, id]));

  function find(id: string): string {
    const p = parent.get(id)!;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  }

  function union(a: string, b: string) {
    parent.set(find(a), find(b));
  }

  return { find, union };
}

/**
 * Raggruppa gli ordini per acquirente tramite union-find su
 * `emailNormalized` OR `phoneNormalized`.
 * Include solo ordini con `historyConsent.granted === true`.
 */
export function groupOrdersByBuyer(
  allOrders: OrderForHistory[],
): BuyerGroup[] {
  const orders = allOrders.filter((o) => o.historyConsent.granted);
  if (orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const { find, union } = makeUnionFind(ids);

  const byEmail = new Map<string, string>(); // emailNorm → first orderId
  const byPhone = new Map<string, string>(); // phoneNorm → first orderId

  for (const order of orders) {
    const email = order.buyer.emailNormalized;
    const phone = normalizePhone(order.buyer.phoneNormalized); // già normalizzato, ma riapplico

    if (email) {
      const prev = byEmail.get(email);
      if (prev) union(order.id, prev);
      else byEmail.set(email, order.id);
    }

    if (phone) {
      const prev = byPhone.get(phone);
      if (prev) union(order.id, prev);
      else byPhone.set(phone, order.id);
    }
  }

  // Raggruppa per root
  const groups = new Map<string, OrderForHistory[]>();
  for (const order of orders) {
    const root = find(order.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(order);
  }

  return Array.from(groups.entries()).map(([rootId, groupOrders]) => {
    // Ordina per data decrescente
    const sorted = [...groupOrders].sort((a, b) => {
      const getMs = (ts: unknown) => {
        if (!ts) return 0;
        if (typeof ts === "object" && ts !== null && "toMillis" in ts)
          return (ts as { toMillis(): number }).toMillis();
        if (typeof ts === "string") return new Date(ts).getTime();
        return 0;
      };
      return getMs(b.createdAt) - getMs(a.createdAt);
    });

    const most = sorted[0]!;
    const emails = [...new Set(groupOrders.map((o) => o.buyer.emailNormalized).filter(Boolean))];
    const phones = [...new Set(groupOrders.map((o) => o.buyer.phoneNormalized).filter(Boolean))];
    const eventIds = [...new Set(groupOrders.filter((o) => o.status === "paid").map((o) => o.eventId))];
    const eventTitles = [...new Set(groupOrders.filter((o) => o.status === "paid").map((o) => o.eventTitleIt))];

    const totalSeats = groupOrders
      .filter((o) => o.status === "paid")
      .reduce((s, o) => s + o.seats, 0);

    const grossCents = groupOrders
      .filter((o) => o.status === "paid")
      .reduce((s, o) => s + o.totalCents, 0);
    const refundedCents = groupOrders
      .filter((o) => o.status === "refunded")
      .reduce((s, o) => s + o.totalCents, 0);

    return {
      id: rootId,
      displayName: `${most.buyer.firstName} ${most.buyer.lastName}`.trim(),
      emails,
      phones,
      orderCount: groupOrders.length,
      totalSeats,
      totalSpentCents: grossCents - refundedCents,
      eventIds,
      eventTitles,
      orders: sorted,
    };
  });
}
