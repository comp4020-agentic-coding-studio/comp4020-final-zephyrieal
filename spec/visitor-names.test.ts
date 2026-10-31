import { randomUUID } from "node:crypto";
import { expect, inject, it } from "vitest";
import { cookieFor } from "./identity.ts";
import WebSocket from "ws";
import { nextMessage } from "./ws-client.ts";

// A chosen name is tied to the signed visitor cookie (no sign-in), survives
// reconnects, and replaces "Visitor xxxx" above the avatar for everyone.
const baseUrl = inject("baseUrl");

function postName(visitorId: string, name: unknown) {
  return fetch(new URL("/api/name", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieFor(visitorId) },
    body: JSON.stringify({ name }),
  });
}

it("a new visitor has no name until they choose one, then keeps it", async () => {
  const visitorId = randomUUID();
  const state = () => fetch(new URL("/api/state", baseUrl), { headers: { cookie: cookieFor(visitorId) } }).then(r => r.json());
  expect((await state()).visitorName).toBeNull();

  const res = await postName(visitorId, "  Hay   Enjoyer ");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, name: "Hay Enjoyer" });
  expect((await state()).visitorName).toBe("Hay Enjoyer");
});

it("rejects empty, over-long and non-string names", async () => {
  for (const name of ["", "   ", "x".repeat(21), 42, null]) {
    expect((await postName(randomUUID(), name)).status).toBe(400);
  }
});

// The welcome frame is sent the moment the socket opens, so listen before then.
function join(visitorId: string) {
  const url = new URL("/ws", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(url, { headers: { cookie: cookieFor(visitorId) } });
  return { ws, welcome: nextMessage(ws, m => m.type === "presence-welcome") };
}

it("broadcasts a rename live and labels the avatar on reconnect", async () => {
  const named = randomUUID();
  const a = join(named), b = join(randomUUID());
  try {
    const { selfId } = await a.welcome;
    await b.welcome;
    const renamed = nextMessage(b.ws, m => m.type === "presence-state" &&
      m.players.some((p: { id: string; name?: string }) => p.id === selfId && p.name === "Clover's Friend"));
    await postName(named, "Clover's Friend");
    await renamed;

    const again = join(named);
    try {
      const rejoin = await again.welcome;
      expect(rejoin.players.find((p: { id: string }) => p.id === rejoin.selfId).name).toBe("Clover's Friend");
    } finally { again.ws.close(); }
  } finally { a.ws.close(); b.ws.close(); }
});
