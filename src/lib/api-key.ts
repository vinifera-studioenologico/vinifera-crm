import { NextRequest } from "next/server";

/**
 * Verifica che la request contenga un Bearer token valido.
 * Confronta con CRM_API_KEY in env.
 * Timing-safe comparison per prevenire timing attacks.
 */
export function verifyApiKey(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const expected = process.env.CRM_API_KEY;
  if (!expected) return false;

  if (token.length !== expected.length) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(token);
  const b = encoder.encode(expected);
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}
