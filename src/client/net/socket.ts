// Server -> client push only (see src/server/realtime.ts). Reconnects with
// capped exponential backoff so a Fly idle-stop cold start (fly.toml:
// auto_stop_machines, min_machines_running=0 --- any open connection gets
// severed when the machine sleeps) self-heals once the next HTTP request
// wakes it back up.
export type RealtimeMessage =
  | { type: "furniture-placed"; furniture: unknown }
  | { type: "furniture-moved"; furniture: unknown }
  | { type: "furniture-rotated"; furniture: unknown }
  | { type: "furniture-stored"; furniture: unknown }
  | { type: "furniture-retrieved"; furniture: unknown }
  | { type: "balance-updated"; balance: number }
  | { type: "purchase-rejected"; reason: string }
  | {
      type: "construction-progress";
      progressUnits: number;
      targetUnits: number;
      status: "in_progress" | "completed";
      activeBuilders: number;
      multiplierUnits: number;
      hadCooperativeMoment: boolean;
    };

export interface RealtimeHandle {
  close(): void;
}

export function connectRealtime(
  onMessage: (msg: RealtimeMessage) => void,
  onOpen?: () => void,
): RealtimeHandle {
  let socket: WebSocket | undefined;
  let backoff = 500;
  let closedByUs = false;

  function open() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${proto}//${location.host}/ws`);
    socket.addEventListener("open", () => {
      backoff = 500;
      onOpen?.();
    });
    socket.addEventListener("message", (event) => {
      try {
        onMessage(JSON.parse(event.data as string));
      } catch {
        // malformed frame --- ignore rather than crash the client
      }
    });
    socket.addEventListener("close", () => {
      if (closedByUs) return;
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 10000);
    });
  }

  open();

  return {
    close() {
      closedByUs = true;
      socket?.close();
    },
  };
}
