import { useEffect, useState } from "react";
import { GIANT_CARROT as C } from "../../shared/carrot.ts";
import { inReach } from "../../shared/interactions.ts";
import { worldPosition } from "../game/cameraState.ts";
import { presenceState } from "../game/presenceState.ts";
import { sanctuaryState } from "../game/sanctuaryState.ts";
import { EventBus } from "../game/eventBus.ts";
export function CarrotBubble() {
  const [, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => refresh(n => n+1), 100);
    const done = () => setBusy(false);
    EventBus.on("carrot-action-complete", done);
    return () => { clearInterval(timer); EventBus.off("carrot-action-complete", done); };
  }, []);
  const self = presenceState.players.find(p => p.id === presenceState.selfId);
  const state = sanctuaryState.carrot;
  if (!self || self.room !== "outdoor" || !state) return null;
  const now = state.serverNow + Date.now() - sanctuaryState.carrotReceivedAt;
  const ready = now >= state.readyAt;
  const joined = state.pullers.includes(self.id);
  const close = inReach(self, C.x, C.y, C.reach);
  if (!close) return null;
  const message = !ready ? "Pulled together! +3 carrots for everyone · growing again"
    : state.pullers.length >= 2 ? `Pulling together… ${Math.min(100,Math.floor(state.progressMs/C.pullMs*100))}%`
    : state.pullers.length ? "One visitor pulling · join in!" : "Giant carrot · needs two visitors";
  return <>
    <div className="carrot-caption" style={worldPosition(C.x, C.y-85)} role="status" aria-live="off">{message}</div>
    {close && ready && <button type="button" className="world-bubble" aria-label={joined ? "Stop pulling carrot" : "Pull giant carrot"}
      disabled={busy || !presenceState.connected} style={worldPosition(C.x,C.y+45)}
      onPointerDown={e => e.stopPropagation()} onClick={() => { setBusy(true); EventBus.emit("attempt-carrot",joined ? "leave" : "join",state.round); }}>
      {joined ? "Stop pulling" : "Pull together"}
    </button>}
  </>;
}
