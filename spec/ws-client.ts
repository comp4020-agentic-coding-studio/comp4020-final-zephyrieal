// Test-only helper. The existing fetch-based specs (flowers.test.ts,
// trace.test.ts) needed no shared helper, but a WebSocket test needs two
// things that doesn't cover: opening a socket *as a specific visitor*, and
// awaiting a specific message type. Node's own global `WebSocket` can't set a
// custom Cookie header on the handshake (needed here to simulate "visitor
// B"), so this reuses the `ws` package already required server-side
// (src/server/realtime.ts) rather than adding a new dependency just for
// tests.
import WebSocket from "ws";

export function connectAs(baseUrl: string, visitorId: string): Promise<WebSocket> {
  const url = new URL("/ws", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(url, { headers: { cookie: `visitor=${visitorId}` } });
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

export function nextMessage(
  ws: WebSocket,
  match: (msg: any) => boolean,
  timeoutMs = 2000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for a matching ws message")),
      timeoutMs,
    );
    const onMessage = (data: Buffer) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return; // not JSON --- ignore rather than fail on an unrelated frame
      }
      if (match(msg)) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(msg);
      }
    };
    ws.on("message", onMessage);
  });
}
