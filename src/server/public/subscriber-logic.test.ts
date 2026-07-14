import { describe, it, expect } from "vitest";
import { decideSubscribeAction, shouldNotifySubscribers } from "@/server/public/subscriber-logic";
import type { SubscriberStatus } from "@/server/public/subscriber-logic";

describe("decideSubscribeAction", () => {
  it("null → create_new", () => {
    expect(decideSubscribeAction(null).action).toBe("create_new");
  });

  it("pending → resend_confirm", () => {
    expect(decideSubscribeAction("pending").action).toBe("resend_confirm");
  });

  it("unsubscribed → re_subscribe", () => {
    expect(decideSubscribeAction("unsubscribed").action).toBe("re_subscribe");
  });

  it("active → noop_already_active (idempotente)", () => {
    expect(decideSubscribeAction("active").action).toBe("noop_already_active");
  });

  it("copre tutti i valori di SubscriberStatus", () => {
    const statuses: Array<SubscriberStatus | null> = ["pending", "active", "unsubscribed", null];
    for (const s of statuses) {
      expect(() => decideSubscribeAction(s)).not.toThrow();
    }
  });
});

describe("shouldNotifySubscribers", () => {
  it("null → true (non ancora inviato)", () => {
    expect(shouldNotifySubscribers(null)).toBe(true);
  });

  it("undefined → true", () => {
    expect(shouldNotifySubscribers(undefined)).toBe(true);
  });

  it("Timestamp valorizzato → false (già inviato)", () => {
    const fakeTs = { toDate: () => new Date(), toMillis: () => Date.now() };
    expect(shouldNotifySubscribers(fakeTs)).toBe(false);
  });

  it("stringa ISO → false", () => {
    expect(shouldNotifySubscribers("2026-11-01T12:00:00Z")).toBe(false);
  });
});
