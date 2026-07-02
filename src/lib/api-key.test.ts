import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyApiKey } from "./api-key";
import type { NextRequest } from "next/server";

function makeRequest(authHeader?: string): NextRequest {
  return {
    headers: {
      get: (name: string) => {
        if (name === "authorization") return authHeader ?? null;
        return null;
      },
    },
  } as unknown as NextRequest;
}

describe("verifyApiKey", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("rifiuta se CRM_API_KEY non è impostata", () => {
    vi.stubEnv("CRM_API_KEY", "");
    expect(verifyApiKey(makeRequest("Bearer some-token"))).toBe(false);
  });

  it("rifiuta se manca header Authorization", () => {
    vi.stubEnv("CRM_API_KEY", "test-key-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(verifyApiKey(makeRequest())).toBe(false);
  });

  it("rifiuta se header non inizia con Bearer", () => {
    vi.stubEnv("CRM_API_KEY", "test-key");
    expect(verifyApiKey(makeRequest("Basic test-key"))).toBe(false);
  });

  it("rifiuta token diverso", () => {
    vi.stubEnv("CRM_API_KEY", "correct-key-xxxxx");
    expect(verifyApiKey(makeRequest("Bearer wrong-key-xxxxxx"))).toBe(false);
  });

  it("rifiuta token di lunghezza diversa", () => {
    vi.stubEnv("CRM_API_KEY", "short");
    expect(verifyApiKey(makeRequest("Bearer very-long-token-here"))).toBe(false);
  });

  it("accetta token corretto", () => {
    const key = "my-secret-api-key-for-testing-1234567890abcdef";
    vi.stubEnv("CRM_API_KEY", key);
    expect(verifyApiKey(makeRequest(`Bearer ${key}`))).toBe(true);
  });

  it("rifiuta token con un singolo carattere diverso", () => {
    const key = "abcdefghij1234567890";
    vi.stubEnv("CRM_API_KEY", key);
    expect(verifyApiKey(makeRequest("Bearer abcdefghij1234567891"))).toBe(false);
  });
});
