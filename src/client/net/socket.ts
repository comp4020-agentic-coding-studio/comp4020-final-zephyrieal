import type { FarmState } from "../../shared/farm.ts";
import type { GuineaPig } from "../state/useSanctuary.ts";
import type { MoveIntent, PresenceMessage } from "../../shared/presence.ts";

export type RealtimeMessage =
  | PresenceMessage
  | { type: "construction-dust"; projectId: string }
  | { type: "farm-updated"; farm: FarmState }
  | { type: "guinea-pig-fed"; guineaPigId: string; guineaPig: GuineaPig }
  | { type: "furniture-placed"; furniture: unknown }
  | { type: "furniture-moved"; furniture: unknown }
  | { type: "furniture-rotated"; furniture: unknown }
  | { type: "furniture-stored"; furniture: unknown }
  | { type: "furniture-retrieved"; furniture: unknown }
  | { type: "balance-updated"; balance: number }
  | { type: "purchase-rejected"; reason: string }
  | {
      type: "construction-progress";
      projectId: string;
      progressUnits: number;
      targetUnits: number;
      status: "in_progress" | "completed";
      activeBuilders: number;
      multiplierUnits: number;
      hadCooperativeMoment: boolean;
    }
  | {
      type: "guinea-pig-walking";
      guineaPigId: string;
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      startedAt: number;
      durationMs: number;
    };

export interface RealtimeHandle {
  close(): void;
  send(intent: MoveIntent): void;
}

export function connectRealtime(
  onMessage: (msg: RealtimeMessage) => void,
  onOpen?: () => void,
  onDisconnect?: () => void,
): RealtimeHandle {
  let socket: WebSocket | undefined;
  let backoff = 500;
  let closedByUs = false;

  let retry: ReturnType<typeof setTimeout> | undefined;
  function scheduleReconnect() {
    if (closedByUs) return;
    retry = setTimeout(() => void open(), backoff);
    backoff = Math.min(backoff * 2, 10000);
  }
  async function open() {
    if (closedByUs) return;
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("identity unavailable");
    } catch {
      scheduleReconnect();
      return;
    }
    if (closedByUs) return;
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
      onDisconnect?.();
      scheduleReconnect();
    });
  }

  void open();

  return {
    send(intent) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(intent));
    },
    close() {
      closedByUs = true;
      clearTimeout(retry);
      socket?.close();
    },
  };
}
