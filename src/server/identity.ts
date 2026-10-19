import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Minimal anti-forgery for the existing anonymous visitor cookie --- not an
// account system (CLAUDE.md bans "mandatory accounts"; this adds no login,
// no password, still no server-side session store). Before this, both
// index.ts and realtime.ts independently regex-matched a plain
// `visitor=<uuid>` cookie with no verification at all: any client could set
// that cookie to any UUID-shaped string and the server would trust it as
// that visitor's identity outright, including their Care Points balance.
// Signing the id (HMAC, not encryption --- the id itself is still visible,
// only now tamper-evident) closes that gap while keeping everything else
// about the identity model the same: anonymous, cookie-only, one shared
// helper both index.ts and realtime.ts now call instead of each keeping its
// own copy of the parsing logic. See
// docs/decisions/0005-visitor-identity-and-permissions.md.
//
// SESSION_SECRET is set as a Fly secret in production (never committed ---
// see fly.toml's own comment about [env] being the place for non-secret
// config only); the dev fallback here is intentionally fixed and public so
// `pnpm dev`/`pnpm test` need no extra setup --- it is not meant to resist
// anyone who can read this file.
const SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-do-not-use-in-production";

const VISITOR_COOKIE_PATTERN = /visitor=([a-f0-9-]+\.[A-Za-z0-9_-]+)/;

function sign(id: string): string {
  return createHmac("sha256", SECRET).update(id).digest("base64url");
}

export const VISITOR_COOKIE_MAX_AGE = 31536000; // seconds --- unchanged from before signing

export function mintVisitorCookie(): { id: string; cookieValue: string } {
  const id = randomUUID();
  return { id, cookieValue: `${id}.${sign(id)}` };
}

// Returns the verified visitor id, or undefined if the cookie is missing,
// malformed, or its signature doesn't match --- any of those are treated
// identically by callers (mint a fresh identity), so this never needs to
// distinguish "no cookie" from "forged cookie" for the caller to do the
// right thing.
export function verifyVisitorCookie(cookieHeader: string | undefined): string | undefined {
  const token = (cookieHeader ?? "").match(VISITOR_COOKIE_PATTERN)?.[1];
  if (!token) return undefined;

  const dot = token.lastIndexOf(".");
  const id = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(id);

  // timingSafeEqual throws on length mismatch rather than returning false,
  // and requires equal-length buffers --- checked explicitly first so a
  // short or malformed signature can't throw past this into a 500.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;

  return id;
}
