import type { Room } from "../../shared/rooms.ts";
import type { FarmState, Crop } from "../../shared/farm.ts";
import { useEffect, useRef, useState } from "react";
import { connectRealtime } from "../net/socket.ts";
import { applyPresence, clearPresence, presenceState } from "../game/presenceState.ts";
import type { PresenceIntent } from "../../shared/presence.ts";
import { EventBus } from "../game/eventBus.ts";
import { sanctuaryState } from "../game/sanctuaryState.ts";
import type { FurnitureRow } from "../../server/furniture.ts";
import type { ConstructionSnapshot } from "../../server/construction.ts";
import type { GuineaPigMovement } from "../../server/guinea-pig.ts";

export interface GuineaPig {
  name: string;
  personality: string;
  feed_count: number;
  last_fed_at: string | null;
}

interface StateResponse {
  guineaPig: GuineaPig;
  guineaPigs: (GuineaPig & { id: string; movement: GuineaPigMovement })[];
  guineaPigMovement: GuineaPigMovement;
  farm: FarmState;
  furniture: FurnitureRow[];
  storedFurniture: FurnitureRow[];
  carePoints: number;
  construction: Record<string, ConstructionSnapshot>;
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

  const [furniture, setFurniture] = useState<FurnitureRow[]>([]);
  const [storedFurniture, setStoredFurniture] = useState<FurnitureRow[]>([]);
  const [construction, setConstruction] = useState<Record<string, ConstructionSnapshot>>({});
  const [rejection, setRejection] = useState<string | null>(null);
  const rejectionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function applyFarm(farm: FarmState) {
    sanctuaryState.farm = farm;
    sanctuaryState.farmReceivedAt = Date.now();
    EventBus.emit("farm-updated");
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
    if (row.room_id !== (sanctuaryState.room === "outdoor" ? "indoor" : sanctuaryState.room)) return;
    applyFurniture([...sanctuaryState.furniture.filter((f) => f.id !== row.id), row]);
  }

  function removeFurnitureRow(id: number) {
    applyFurniture(sanctuaryState.furniture.filter((f) => f.id !== id));
  }

  function addStoredRow(row: FurnitureRow) {
    if (row.room_id !== (sanctuaryState.room === "outdoor" ? "indoor" : sanctuaryState.room)) return;
    setStoredFurniture((prev) => [...prev.filter((f) => f.id !== row.id), row]);
  }

  function removeStoredRow(id: number) {
    setStoredFurniture((prev) => prev.filter((f) => f.id !== id));
  }

  // The transition detection (not-completed -> completed) happens here, once,
  // per project, regardless of whether the snapshot arrived via this
  // visitor's own contribute() response or a WS broadcast from someone
  // else's --- both paths funnel through this function. Keyed by projectId
  // so building on one project never touches another's state or fires its
  // completion celebration.
  function applyConstruction(projectId: string, next: ConstructionSnapshot) {
    const wasCompleted = sanctuaryState.construction[projectId]?.status === "completed";
    sanctuaryState.construction = { ...sanctuaryState.construction, [projectId]: next };
    setConstruction(sanctuaryState.construction);
    EventBus.emit("construction-updated", projectId);
    if (!wasCompleted && next.status === "completed") {
      EventBus.emit("construction-celebrate", projectId);
    }
  }

  // Write-through only --- nothing in React ever renders Potato's position
  // (CLAUDE.md's Interface rule: communicate through behavior, not a stat
  // readout), so there's no matching useState here, unlike applyConstruction.
  // Phaser is the only reader, via sanctuaryState + this event.
  function applyGuineaPigMovement(next: GuineaPigMovement, id = "potato") {
    const pig = sanctuaryState.guineaPigs[id];
    if (pig) sanctuaryState.guineaPigs[id] = { ...pig, movement: next, receivedAt: Date.now() };
    if (id === "potato") {
    sanctuaryState.guineaPigMovement = next;
    sanctuaryState.guineaPigReceivedAt = Date.now();
    }
    EventBus.emit("guinea-pig-moved", id);
  }

  function flashRejection(reason: string) {
    setRejection(reason);
    clearTimeout(rejectionTimer.current);
    rejectionTimer.current = setTimeout(() => setRejection(null), 2500);
  }

  async function loadState() {
    const requestedRoom = sanctuaryState.room;
    const res = await fetch(`/api/state?room=${encodeURIComponent(requestedRoom)}`);
    const data = (await res.json()) as StateResponse;
    if (requestedRoom !== sanctuaryState.room) return;
    sanctuaryState.guineaPigs = Object.fromEntries(data.guineaPigs.map(p => [p.id, { ...p, receivedAt: Date.now() }]));
    EventBus.emit("guinea-pigs-loaded");
    setGuineaPig(data.guineaPig);
    applyGuineaPigMovement(data.guineaPigMovement);
    setCarePoints(data.carePoints);
    applyFarm(data.farm);
    applyFurniture(data.furniture);
    setStoredFurniture(data.storedFurniture);
    for (const [projectId, snapshot] of Object.entries(data.construction)) {
      applyConstruction(projectId, snapshot);
    }
  }

  let changingRoom = false;
  async function changeRoom(room: Room) {
    if (changingRoom) return;
    changingRoom = true;
    try {
      const response = await fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json", "X-Player-Id": presenceState.selfId }, body: JSON.stringify({ room }) });
      const result = await response.json();
      if (!response.ok) { flashRejection(result.reason); return; }
      sanctuaryState.room = room;
      applyFurniture([]); setStoredFurniture([]);
      EventBus.emit("room-changed", room);
      EventBus.emit("switch-scene", room);
      EventBus.emit("close-construction-panel");
      await loadState();
    } catch { flashRejection("Could not change rooms. Please try again."); }
    finally { changingRoom = false; }
  }

  let feeding = false;
  async function feed(crop: Crop = "hay", guineaPigId = "potato") {
    if (feeding) return;
    feeding = true;
    try {
    const res = await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Player-Id": presenceState.selfId },
      body: JSON.stringify({ requestId: crypto.randomUUID(), crop, guineaPigId }),
    });
    const data = await res.json();
    if (!res.ok) { flashRejection(data.reason ?? "Could not feed Potato."); return; }
    if (guineaPigId === "potato") setGuineaPig(data.guineaPig);
    setCarePoints(data.balance);
    } catch { flashRejection("Connection interrupted. Try feeding again."); }
    finally { feeding = false; }
  }

  async function tendFarm(intent: { action: "plant" | "harvest"; plotId: number; crop?: Crop; version: number; requestId: string }) {
    try {
      const res = await fetch(`/api/farm/${intent.action}`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Player-Id": presenceState.selfId },
        body: JSON.stringify(intent),
      });
      const data = await res.json();
      if (data.farm) applyFarm(data.farm);
      if (!res.ok) flashRejection(data.reason ?? "Could not tend this plot.");
    } catch { flashRejection("Connection interrupted. Try tending the plot again."); }
    finally { EventBus.emit("farm-action-complete"); }
  }

  async function buyFurniture(kind: string, tileX: number, tileY: number, requestId: string) {
    const res = await fetch("/api/furniture/place", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Player-Id": presenceState.selfId },
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
      headers: { "Content-Type": "application/json", "X-Player-Id": presenceState.selfId },
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
      headers: { "Content-Type": "application/json", "X-Player-Id": presenceState.selfId },
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
      headers: { "Content-Type": "application/json", "X-Player-Id": presenceState.selfId },
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
  async function contributeToConstruction(projectId: string, requestId: string) {
    const res = await fetch("/api/construction/contribute", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Player-Id": presenceState.selfId },
      body: JSON.stringify({ projectId, requestId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      EventBus.emit("construction-contribute-result", { ok: false, reason: data.reason });
      flashRejection(data.reason ?? "that didn't work");
      return;
    }
    applyConstruction(projectId, {
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
    const onAttemptConstructionContribute = ({
      projectId,
      requestId,
    }: {
      projectId: string;
      requestId: string;
    }) => void contributeToConstruction(projectId, requestId);

    const onRoom = (room: Room) => void changeRoom(room);
    EventBus.on("attempt-room", onRoom);
    const onFeed = (crop?: Crop, guineaPigId?: string) => void feed(crop, guineaPigId);
    EventBus.on("attempt-feed", onFeed);
    EventBus.on("interaction-rejected", flashRejection);
    const onFarm = (intent: Parameters<typeof tendFarm>[0]) => void tendFarm(intent);
    EventBus.on("attempt-farm", onFarm);
    EventBus.on("attempt-placement", onAttemptPlacement);
    EventBus.on("attempt-furniture-edit", onAttemptFurnitureEdit);
    EventBus.on("attempt-store-furniture", onAttemptStoreFurniture);
    EventBus.on("attempt-retrieve-furniture", onAttemptRetrieveFurniture);
    EventBus.on("attempt-construction-contribute", onAttemptConstructionContribute);

    const realtime = connectRealtime(
      (msg) => {
        if (msg.type === "presence-welcome" || msg.type === "presence-state") {
          applyPresence(msg);
          return;
        }
        if (msg.type === "farm-updated") { applyFarm(msg.farm); return; }
        if (msg.type === "guinea-pig-fed") {
          if (msg.guineaPigId === "potato") setGuineaPig(msg.guineaPig);
          const pig = sanctuaryState.guineaPigs[msg.guineaPigId];
          if (pig) Object.assign(pig, msg.guineaPig);
          EventBus.emit("guinea-pig-fed", msg.guineaPigId); return;
        }
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
        } else if (msg.type === "construction-dust") {
          EventBus.emit("construction-dust", msg.projectId);
        } else if (msg.type === "construction-progress") {
          applyConstruction(msg.projectId, {
            progressUnits: msg.progressUnits,
            targetUnits: msg.targetUnits,
            status: msg.status,
            activeBuilders: msg.activeBuilders,
            multiplierUnits: msg.multiplierUnits,
            hadCooperativeMoment: msg.hadCooperativeMoment,
          });
        } else if (msg.type === "guinea-pig-walking") {
          applyGuineaPigMovement({
            room: msg.room ?? "outdoor",
            x: msg.x,
            y: msg.y,
            targetX: msg.targetX,
            targetY: msg.targetY,
            startedAt: msg.startedAt,
            durationMs: msg.durationMs,
          }, msg.guineaPigId);
        }
      },
      // Re-hydrate on every open, including reconnects --- this is the whole
      // mechanism for "a reconnecting visitor gets the latest layout without
      // reloading" (scenario 6).
      () => {
        if (sanctuaryState.room.startsWith("house:")) {
          sanctuaryState.room = "outdoor";
          EventBus.emit("room-changed", "outdoor"); EventBus.emit("switch-scene", "outdoor");
        }
        void loadState();
      },
      clearPresence,
    );
    const onVisitorInput = (intent: PresenceIntent) => realtime.send(intent);
    EventBus.on("visitor-input", onVisitorInput);

    return () => {
      EventBus.off("attempt-room", onRoom);
      EventBus.off("attempt-feed", onFeed);
      EventBus.off("interaction-rejected", flashRejection);
      EventBus.off("attempt-farm", onFarm);
      EventBus.off("attempt-placement", onAttemptPlacement);
      EventBus.off("attempt-furniture-edit", onAttemptFurnitureEdit);
      EventBus.off("attempt-store-furniture", onAttemptStoreFurniture);
      EventBus.off("attempt-retrieve-furniture", onAttemptRetrieveFurniture);
      EventBus.off("attempt-construction-contribute", onAttemptConstructionContribute);
      EventBus.off("visitor-input", onVisitorInput);
      realtime.close();
      clearPresence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { guineaPig, carePoints, furniture, storedFurniture, construction, rejection, feed };
}
