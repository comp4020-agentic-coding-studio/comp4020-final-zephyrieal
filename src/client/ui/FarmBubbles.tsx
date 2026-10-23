import { cameraState, worldPosition as position, menuPosition } from "../game/cameraState.ts";
import { GUINEA_PIGS } from "../../shared/guinea-pigs.ts";
import { useEffect, useState } from "react";
import { CROPS, CROP_KEYS, FARM_PLOTS, FARM_REACH, type Crop } from "../../shared/farm.ts";
import { inReach, MEADOW_WIDTH, MEADOW_HEIGHT } from "../../shared/interactions.ts";
import { presenceState } from "../game/presenceState.ts";
import { sanctuaryState } from "../game/sanctuaryState.ts";
import { EventBus } from "../game/eventBus.ts";
function self() { return presenceState.players.find(p => p.id === presenceState.selfId); }
function useWorldTick() {
  const [, refresh] = useState(0);
  useEffect(() => {
    let frame = 0, last = 0;
    const tick = (now: number) => { if (now - last > 16) { refresh(n => n + 1); last = now; } frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
}
export function FarmBubbles() {
  useWorldTick();
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const done = () => setBusy(false);
    EventBus.on("farm-action-complete", done);
    return () => { EventBus.off("farm-action-complete", done); };
  }, []);
  const player = self();
  const farm = sanctuaryState.farm;
  const current = FARM_PLOTS.find(p => p.id === selected);
  const reachable = current && inReach(player, current.x, current.y, FARM_REACH);
  useEffect(() => { if (!reachable) setSelected(null); }, [reachable]);
  if (!player || player.room !== "outdoor" || !farm) return null;
  const plot = farm.plots.find(p => p.id === selected);
  const now = farm.serverNow + Date.now() - sanctuaryState.farmReceivedAt;
  function tend(action: "plant" | "harvest", crop?: Crop) {
    if (!plot || busy) return;
    setBusy(true);
    EventBus.emit("attempt-farm", { action, crop, plotId: plot.id, version: plot.version, requestId: crypto.randomUUID() });
  }
  return <>
    {FARM_PLOTS.map(p => <button key={p.id} type="button" className="farm-plot-target"
      aria-label="Shared farm" style={{ ...position(p.x, p.y), width: `${110 * cameraState.zoom / cameraState.width * 100}%`, height: `${76 * cameraState.zoom / cameraState.height * 100}%` }}
      onPointerDown={e => e.stopPropagation()}
      onClick={() => {
        if (inReach(player, p.x, p.y, FARM_REACH)) setSelected(p.id);
        else EventBus.emit("interaction-rejected", "Walk closer to the shared farm to choose what to plant.");
      }} />)}
    {current && reachable && plot && <div className="farm-menu" role="dialog" aria-label="Shared farm options"
      style={menuPosition(current.x, current.y - 45)} onPointerDown={e => e.stopPropagation()}>
      <button className="bubble-close" aria-label="Close farm" onClick={() => setSelected(null)}>×</button>
      {!plot.crop ? <><strong>Plant food for Potato</strong><div className="crop-choices">
        {CROP_KEYS.filter(crop => crop !== "carrot").map(crop => <button key={crop} disabled={busy} onClick={() => tend("plant", crop)}>{CROPS[crop].name}</button>)}
      </div></> : now >= plot.readyAt! ? <><strong>{CROPS[plot.crop].name} is ready!</strong>
        <button disabled={busy} onClick={() => tend("harvest")}>Harvest for Potato</button></>
        : <><strong>Growing {CROPS[plot.crop].name.toLowerCase()}</strong><p>Ready in {Math.ceil((plot.readyAt! - now) / 1000)}s</p></>}
      <small>Public garden · anyone can plant or harvest</small>
    </div>}
  </>;
}
export function FoodBubble({ action }: { action?: { x: number; y: number; pigId?: string; name?: string } }) {
  useWorldTick();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    EventBus.on("open-food-menu", show);
    return () => { EventBus.off("open-food-menu", show); };
  }, []);
  useEffect(() => { if (!action) setOpen(false); }, [Boolean(action)]);
  if (!open || !action) return null;
  const food = sanctuaryState.farm?.food;
  return <div className="farm-menu food-menu" role="dialog" aria-label={`Feed ${action.name} food choices`}
    style={menuPosition(action.x, action.y)} onPointerDown={e => e.stopPropagation()}>
    <button className="bubble-close" aria-label="Close food choices" onClick={() => setOpen(false)}>×</button>
    <strong>Give {action.name} a snack</strong>
    <small>{GUINEA_PIGS.find(p => p.id === action.pigId)?.breed} guinea pig</small>
    <div className="crop-choices">{CROP_KEYS.map(crop => <button key={crop}
      aria-label={CROPS[crop].name}
      disabled={crop !== "hay" && !food?.[crop]}
      onClick={() => { EventBus.emit("attempt-feed", crop, action.pigId); setOpen(false); }}>
      {CROPS[crop].name}{crop !== "hay" ? ` (${food?.[crop] ?? 0})` : ""}<small>+{CROPS[crop].carePoints} care points</small></button>)}</div>
    <small>Hay is always available. Grow vegetables, or pull the giant carrot together.</small>
  </div>;
}
