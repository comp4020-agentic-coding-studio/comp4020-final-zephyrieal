import { createHmac } from "node:crypto";

// Test-only helper. Mirrors src/server/identity.ts's signing exactly, using
// the same SESSION_SECRET env var (unset in both the test runner and the
// app under test, so both fall back to the same dev default) --- lets every
// spec file keep picking its own visitor ids directly (randomUUID(), one
// per "visitor A"/"visitor B" in a test) while still producing a cookie the
// server's signature check accepts, instead of being silently replaced with
// a fresh identity on every request.
const SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-do-not-use-in-production";

export function cookieFor(visitorId: string): string {
  const signature = createHmac("sha256", SECRET).update(visitorId).digest("base64url");
  return `visitor=${visitorId}.${signature}`;
}
