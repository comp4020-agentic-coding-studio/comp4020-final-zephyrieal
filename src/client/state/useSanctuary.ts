import { useEffect, useRef, useState } from "react";
import { connectRealtime } from "../net/socket.ts";
import { EventBus } from "../game/eventBus.ts";
import { sanctuaryState, type FlowerRow } from "../game/sanctuaryState.ts";
import type { FurnitureRow } from "../../server/furniture.ts";
import type { ConstructionSnapshot } from "../../server/construction.ts";

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
  storedFurniture: FurnitureRow[];
  carePoints: number;
  construction: ConstructionSnapshot;
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
  const [storedFurniture, setStoredFurniture] = useState<FurnitureRow[]>([]);
  const [construction, setConstruction] = useState<ConstructionSnapshot | null>(null);
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

  // Merges one row into the placed list by id --- the shape every buy, edit
  // (move/rotate) and retrieve success, plus the matching WS broadcasts, all
  // use to update what's on the floor.
  function applyFurnitureRow(row: FurnitureRow) {
    applyFurniture([...sanctuaryState.furniture.filter((f) => f.id !== row.id), row]);
  }

  function removeFurnitureRow(id: number) {
    applyFurniture(sanctuaryState.furniture.filter((f) => f.id !== id));
  }

  function addStoredRow(row: FurnitureRow) {
    setStoredFurniture((prev) => [...prev.filter((f) => f.id !== row.id), row]);
  }

  function removeStoredRow(id: number) {
    setStoredFurniture((prev) => prev.filter((f) => f.id !== id));
  }

  // The transition detection (not-completed -> completed) happens here, once,
  // regardless of whether the snapshot arrived via this visitor's own
  // contribute() response or a WS broadcast from someone else's --- both
  // paths funnel through this function.
  function applyConstruction(next: ConstructionSnapshot) {
    const wasCompleted = sanctuaryState.construction?.status === "completed";
    sanctuaryState.construction = next;
    setConstruction(next);
    EventBus.emit("construction-updated");
    if (!wasCompleted && next.status === "completed") {
      EventBus.emit("construction-celebrate");
    }
  }

  function flashRejection(reason: string) {
    setRejection(reason);
    clearTimeout(rejectionTimer.current);
    rejectionTimer.current = setTimeout(() => setRejection(null), 2500);
  }

  async function loadState() {
    const res = await fetch("/api/state");
    const data = (await res.json()) as StateResponse;
    setGuineaPig(data.guineaPig);
    setCarePoints(data.carePoints);
    applyFlowers(data.flowers);
    applyFurniture(data.furniture);
    setStoredFurniture(data.storedFurniture);
    applyConstruction(data.construction);
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
      flashRejection(data.reason ?? "that didn't work");
      return;
    }
    setCarePoints(data.balance);
    applyFurnitureRow(data.furniture);
    EventBus.emit("placement-result", { ok: true });
  }

  // Moves and/or rotates an existing piece --- free, never touches Care
  // Points. On a version conflict the server's `current` row is the fresh
  // truth: apply it immediately so the scene's redraw and the visitor's
  // retry both start from what's actually there now.
  async function editFurniture(
    id: number,
    tileX: number,
    tileY: number,
    rotation: number,
    version: number,
    requestId: string,
  ) {
    const res = await fetch("/api/furniture/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, tileX, tileY, rotation, version, requestId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      if (data.current) applyFurnitureRow(data.current);
      EventBus.emit("furniture-edit-result", {
        ok: false,
        reason: data.reason,
        current: data.current,
      });
      flashRejection(data.reason ?? "that didn't work");
      return;
    }
    applyFurnitureRow(data.furniture);
    EventBus.emit("furniture-edit-result", { ok: true, furniture: data.furniture });
  }

  async function storeFurniture(id: number, version: number, requestId: string) {
    const res = await fetch("/api/furniture/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, version, requestId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      if (data.current) applyFurnitureRow(data.current);
      EventBus.emit("store-result", { ok: false, reason: data.reason, current: data.current });
      flashRejection(data.reason ?? "that didn't work");
      return;
    }
    removeFurnitureRow(data.furniture.id);
    addStoredRow(data.furniture);
    EventBus.emit("store-result", { ok: true });
  }

  // Free for whoever retrieves it. A rejection here almost always means
  // someone else just took it --- either way it's no longer in storage, so
  // the local list drops it regardless of why the request failed.
  async function retrieveFurniture(
    id: number,
    tileX: number,
    tileY: number,
    rotation: number,
    version: number,
    requestId: string,
  ) {
    const res = await fetch("/api/furniture/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, tileX, tileY, rotation, version, requestId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      removeStoredRow(id);
      EventBus.emit("retrieve-result", { ok: false, reason: data.reason });
      flashRejection(data.reason ?? "that didn't work");
      return;
    }
    removeStoredRow(data.furniture.id);
    applyFurnitureRow(data.furniture);
    EventBus.emit("retrieve-result", { ok: true, furniture: data.furniture });
  }

  // One "Build!" click. No progress value is ever sent --- the server alone
  // decides how many units this is worth, from how many distinct visitors
  // it's seen contribute recently (CLAUDE.md, "never trust a client-sent
  // value for construction progress"). Applies the response directly rather
  // than waiting for the echoed broadcast, same reasoning buyFurniture
  // already uses for its own balance update.
  async function contributeToConstruction(requestId: string) {
    const res = await fetch("/api/construction/contribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      EventBus.emit("construction-contribute-result", { ok: false, reason: data.reason });
      flashRejection(data.reason ?? "that didn't work");
      return;
    }
    applyConstruction({
      progressUnits: data.progressUnits,
      targetUnits: data.targetUnits,
      status: data.status,
      activeBuilders: data.activeBuilders,
      multiplierUnits: data.multiplierUnits,
      hadCooperativeMoment: data.hadCooperativeMoment,
    });
    EventBus.emit("construction-contribute-result", { ok: true });
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
    const onAttemptFurnitureEdit = ({
      id,
      tileX,
      tileY,
      rotation,
      version,
      requestId,
    }: {
      id: number;
      tileX: number;
      tileY: number;
      rotation: number;
      version: number;
      requestId: string;
    }) => void editFurniture(id, tileX, tileY, rotation, version, requestId);
    const onAttemptStoreFurniture = ({
      id,
      version,
      requestId,
    }: {
      id: number;
      version: number;
      requestId: string;
    }) => void storeFurniture(id, version, requestId);
    const onAttemptRetrieveFurniture = ({
      id,
      tileX,
      tileY,
      rotation,
      version,
      requestId,
    }: {
      id: number;
      tileX: number;
      tileY: number;
      rotation: number;
      version: number;
      requestId: string;
    }) => void retrieveFurniture(id, tileX, tileY, rotation, version, requestId);
    const onAttemptConstructionContribute = ({ requestId }: { requestId: string }) =>
      void contributeToConstruction(requestId);

    EventBus.on("attempt-plant", onAttemptPlant);
    EventBus.on("attempt-placement", onAttemptPlacement);
    EventBus.on("attempt-furniture-edit", onAttemptFurnitureEdit);
    EventBus.on("attempt-store-furniture", onAttemptStoreFurniture);
    EventBus.on("attempt-retrieve-furniture", onAttemptRetrieveFurniture);
    EventBus.on("attempt-construction-contribute", onAttemptConstructionContribute);

    const realtime = connectRealtime(
      (msg) => {
        if (msg.type === "furniture-placed") {
          applyFurnitureRow(msg.furniture as FurnitureRow);
        } else if (msg.type === "furniture-moved" || msg.type === "furniture-rotated") {
          applyFurnitureRow(msg.furniture as FurnitureRow);
        } else if (msg.type === "furniture-stored") {
          const row = msg.furniture as FurnitureRow;
          removeFurnitureRow(row.id);
          addStoredRow(row);
        } else if (msg.type === "furniture-retrieved") {
          const row = msg.furniture as FurnitureRow;
          removeStoredRow(row.id);
          applyFurnitureRow(row);
        } else if (msg.type === "balance-updated") {
          setCarePoints(msg.balance);
        } else if (msg.type === "purchase-rejected") {
          flashRejection(msg.reason);
        } else if (msg.type === "construction-progress") {
          applyConstruction({
            progressUnits: msg.progressUnits,
            targetUnits: msg.targetUnits,
            status: msg.status,
            activeBuilders: msg.activeBuilders,
            multiplierUnits: msg.multiplierUnits,
            hadCooperativeMoment: msg.hadCooperativeMoment,
          });
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
      EventBus.off("attempt-furniture-edit", onAttemptFurnitureEdit);
      EventBus.off("attempt-store-furniture", onAttemptStoreFurniture);
      EventBus.off("attempt-retrieve-furniture", onAttemptRetrieveFurniture);
      EventBus.off("attempt-construction-contribute", onAttemptConstructionContribute);
      realtime.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { guineaPig, carePoints, flowers, furniture, storedFurniture, construction, rejection, feed };
}
