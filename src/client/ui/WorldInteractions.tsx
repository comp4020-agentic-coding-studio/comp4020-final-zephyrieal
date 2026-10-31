import { SEATS } from "../../shared/campfire.ts";
import { CarrotBubble } from "./CarrotBubble.tsx";
import { worldPosition } from "../game/cameraState.ts";
import { isBuilding } from "../../shared/rooms.ts";
import { FarmBubbles, FoodBubble } from "./FarmBubbles.tsx";
import { useEffect, useState } from "react";
import { EventBus } from "../game/eventBus.ts";
import { presenceState } from "../game/presenceState.ts";
import { sanctuaryState } from "../game/sanctuaryState.ts";
import { inReach, sitePosition, CONSTRUCTION_SITES, FEED_REACH, BUILD_REACH, roomDimensions } from "../../shared/interactions.ts";

interface Action { priority?: number; accessibleName?: string; pigId?: string; name?: string; key: string; label: string; x: number; y: number; run: () => void }
function actions(): Action[] {
  const self = presenceState.players.find(p => p.id === presenceState.selfId);
  if (!presenceState.connected || !self) return [];
  const result: Action[] = [];
  if (self.gesture === "sit") {
    result.push({ key: "stand", accessibleName: "Stand up", priority: -1,
      label: "Stand up", x: self.x, y: self.y + 25,
      run: () => EventBus.emit("visitor-input", { type: "visitor-gesture", gesture: "sit" }) });
  } else {
    // Only the nearest free log gets a prompt. Keep its reach tight so feeding
    // and building remain easy to select when walking away from the seats.
    const seat = SEATS.filter(s => inReach(self, s.x, s.y, 40) &&
      !presenceState.players.some(p => p.seatId === s.id))
      .sort((a,b) => Math.hypot(a.x-self.x,a.y-self.y)-Math.hypot(b.x-self.x,b.y-self.y))[0];
    if (seat) result.push({ key: `seat-${seat.id}`, accessibleName: `Sit on log ${SEATS.indexOf(seat)+1}`, priority: 0,
      label: "Sit", x: seat.x, y: seat.y + 24,
      run: () => EventBus.emit("visitor-input", { type: "campfire-seat", seatId: seat.id }) });
  }
  for (const pig of Object.values(sanctuaryState.guineaPigs)) {
    const movement = pig.movement;
    if ((movement.room ?? "outdoor") !== self.room) continue;
    const remaining = Math.max(0, movement.startedAt + movement.durationMs - pig.receivedAt);
    const t = remaining ? Math.min(1, Math.max(0, (Date.now() - pig.receivedAt) / remaining)) : 1;
    const {width,height}=roomDimensions(self.room);
    const x = (movement.x + (movement.targetX - movement.x) * t) * width / 100;
    const y = (movement.y + (movement.targetY - movement.y) * t) * height / 100;
    if (inReach(self, x, y, FEED_REACH - 4, self.room)) result.push({
      key: `feed-${pig.id}`, pigId: pig.id, name: pig.name, label: `Feed ${pig.name} · E`, x, y: y - 24,
      run: () => EventBus.emit("open-food-menu", pig.id),
    });
  }
  for (const site of self.room === "outdoor" ? CONSTRUCTION_SITES : []) {
    const position = sitePosition(site.projectId)!;
    if (inReach(self, position.x, position.y, BUILD_REACH - 4)) result.push({
      key: site.projectId,
      label: sanctuaryState.construction[site.projectId]?.status === "completed" ? (isBuilding(site.projectId) ? "Enter · E" : "View · E") : "Build · E",
      x: position.x, y: position.y - 32,
      run: () => sanctuaryState.construction[site.projectId]?.status === "completed" && isBuilding(site.projectId)
        ? EventBus.emit("attempt-room", `house:${site.projectId}`)
        : EventBus.emit("open-construction-panel", site.projectId),
    });
  }
  return result.sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1) || Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y));
}
export function WorldInteractions() {
  const [selectedPig, setSelectedPig] = useState("potato");
  useEffect(() => {
    const select = (id: string) => setSelectedPig(id);
    EventBus.on("open-food-menu", select);
    return () => { EventBus.off("open-food-menu", select); };
  }, []);
  const [nearby, setNearby] = useState<Action[]>([]);
  useEffect(() => {
    let frame = 0, last = -Infinity;
    const update = (now: number) => {
      if (now - last > 80) { const next=actions(); setNearby(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next); last = now; }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || !document.activeElement?.classList.contains("game-container")) return;
      const current = actions();
      const action = event.key.toLowerCase() === "e" ? current[0] : undefined;
      if (action) { event.preventDefault(); action.run(); }
    };
    window.addEventListener("keydown", keydown);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", keydown); };
  }, []);
  return <div className="world-interactions" aria-label="Nearby actions">
    <FarmBubbles />
    <CarrotBubble />
    <FoodBubble action={nearby.find(action => action.pigId === selectedPig)} />
    {nearby.map((action, index) => <button key={action.key} type="button"
      className="world-bubble" aria-label={action.accessibleName ?? (action.pigId ? `Feed ${action.name}` : `${action.label.startsWith("Enter") ? "Enter" : "Build"} ${action.key}`)}
      style={worldPosition(action.x, action.y)}
      onPointerDown={event => event.stopPropagation()}
      onClick={() => actions().find(current => current.key === action.key)?.run()}>{action.label.replace(" · E", "")}{index === 0 ? " · E" : ""}</button>)}
  </div>;
}
