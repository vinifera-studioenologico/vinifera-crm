import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const mockGet = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: mockGet,
      }),
    }),
  },
}));

const SECRET = "test-secret";

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost/api/health", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", SECRET);
    mockGet.mockReset();
  });

  describe("public response (no auth)", () => {
    it("returns 200 and { status: 'pass' } when Firestore is healthy", async () => {
      mockGet.mockResolvedValue({});

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ status: "pass" });
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("returns 503 and { status: 'fail' } when Firestore throws", async () => {
      mockGet.mockRejectedValue(new Error("Firestore unavailable"));

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body).toEqual({ status: "fail" });
    });
  });

  describe("authenticated response (with CRON_SECRET)", () => {
    it("returns detailed checks when Firestore is healthy", async () => {
      mockGet.mockResolvedValue({});

      const res = await GET(makeRequest(`Bearer ${SECRET}`));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("pass");
      expect(body.checks.firestore.status).toBe("pass");
      expect(typeof body.checks.firestore.latency).toBe("number");
    });

    it("returns detailed checks with fail when Firestore throws", async () => {
      mockGet.mockRejectedValue(new Error("Firestore unavailable"));

      const res = await GET(makeRequest(`Bearer ${SECRET}`));
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.status).toBe("fail");
      expect(body.checks.firestore.status).toBe("fail");
    });

    it("does NOT expose checks with wrong secret", async () => {
      mockGet.mockResolvedValue({});

      const res = await GET(makeRequest("Bearer wrong-secret"));
      const body = await res.json();

      expect(body).toEqual({ status: "pass" });
      expect(body.checks).toBeUndefined();
    });
  });
});
