import { useEffect, useRef, useState } from "react";
import { connectRealtime } from "../net/socket.ts";
import { EventBus } from "../game/eventBus.ts";
import { sanctuaryState, type FlowerRow } from "../game/sanctuaryState.ts";
import type { FurnitureRow } from "../../server/furniture.ts";

export interface GuineaPig {
  name: string;
  personality: string;
  feed_count: number;
  last_fed_at: string | null;
}

interface StateResponse {
  guineaPig: GuineaPig;
  flowers: FlowerRow[];
  furniture: FurnitureRow[];
  carePoints: number;
}

// The one place every mutating fetch() call happens --- Phaser scenes only
// ever emit an intent ("attempt-plant", "attempt-placement") on the
// EventBus; this hook is what turns an intent into a real request and feeds
// the server's authoritative response back out, both to React (via state)
// and to Phaser (via sanctuaryState + "*-updated" events). See
// src/server/realtime.ts and CLAUDE.md's "the server is authoritative."
export function useSanctuary() {
  const [guineaPig, setGuineaPig] = useState<GuineaPig | null>(null);
  const [carePoints, setCarePoints] = useState(0);
  const [flowers, setFlowers] = useState<FlowerRow[]>([]);
  const [furniture, setFurniture] = useState<FurnitureRow[]>([]);
  const [rejection, setRejection] = useState<string | null>(null);
  const rejectionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function applyFlowers(next: FlowerRow[]) {
    sanctuaryState.flowers = next;
    setFlowers(next);
    EventBus.emit("flowers-updated");
  }

  function applyFurniture(next: FurnitureRow[]) {
    sanctuaryState.furniture = next;
    setFurniture(next);
    EventBus.emit("furniture-updated");
  }

  async function loadState() {
    const res = await fetch("/api/state");
    const data = (await res.json()) as StateResponse;
    setGuineaPig(data.guineaPig);
    setCarePoints(data.carePoints);
    applyFlowers(data.flowers);
    applyFurniture(data.furniture);
  }

  async function feed() {
    const res = await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    const data = (await res.json()) as { guineaPig: GuineaPig; balance: number };
    setGuineaPig(data.guineaPig);
    setCarePoints(data.balance);
  }

  async function plant(x: number, y: number, requestId: string) {
    const res = await fetch("/api/plant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y, requestId }),
    });
    const data = (await res.json()) as { flowers: FlowerRow[] };
    applyFlowers(data.flowers);
  }

  async function buyFurniture(kind: string, tileX: number, tileY: number, requestId: string) {
    const res = await fetch("/api/furniture/place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, tileX, tileY, requestId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      EventBus.emit("placement-result", { ok: false, reason: data.reason });
      setRejection(data.reason ?? "that didn't work");
      clearTimeout(rejectionTimer.current);
      rejectionTimer.current = setTimeout(() => setRejection(null), 2500);
      return;
    }
    setCarePoints(data.balance);
    // Read off the live singleton, not the `furniture` state variable ---
    // this function is captured once (in the effect below, mount-only deps),
    // so closing over React state here would go stale after the first call.
    applyFurniture([
      ...sanctuaryState.furniture.filter((f) => f.id !== data.furniture.id),
      data.furniture,
    ]);
    EventBus.emit("placement-result", { ok: true });
  }

  useEffect(() => {
    const onAttemptPlant = ({ x, y, requestId }: { x: number; y: number; requestId: string }) =>
      void plant(x, y, requestId);
    const onAttemptPlacement = ({
      kind,
      tileX,
      tileY,
      requestId,
    }: {
      kind: string;
      tileX: number;
      tileY: number;
      requestId: string;
    }) => void buyFurniture(kind, tileX, tileY, requestId);

    EventBus.on("attempt-plant", onAttemptPlant);
    EventBus.on("attempt-placement", onAttemptPlacement);

    const realtime = connectRealtime(
      (msg) => {
        if (msg.type === "furniture-placed") {
          const row = msg.furniture as FurnitureRow;
          applyFurniture([...sanctuaryState.furniture.filter((f) => f.id !== row.id), row]);
        } else if (msg.type === "balance-updated") {
          setCarePoints(msg.balance);
        } else if (msg.type === "purchase-rejected") {
          setRejection(msg.reason);
          clearTimeout(rejectionTimer.current);
          rejectionTimer.current = setTimeout(() => setRejection(null), 2500);
        }
      },
      // Re-hydrate on every open, including reconnects --- this is the whole
      // mechanism for "a reconnecting visitor gets the latest layout without
      // reloading" (scenario 6).
      () => void loadState(),
    );

    return () => {
      EventBus.off("attempt-plant", onAttemptPlant);
      EventBus.off("attempt-placement", onAttemptPlacement);
      realtime.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { guineaPig, carePoints, flowers, furniture, rejection, feed };
}
