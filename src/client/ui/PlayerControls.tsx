import { useEffect, useState } from "react";
import { EventBus } from "../game/eventBus.ts";
import { presenceState } from "../game/presenceState.ts";
export function PlayerControls() {
  const [status, setStatus] = useState("Connecting to the sanctuary…");
  useEffect(() => {
    const update = () => {
      const self = presenceState.players.find(player => player.id === presenceState.selfId);
      const others = presenceState.players.filter(player => player.room === self?.room && player.id !== self?.id).length;
      setStatus(!presenceState.connected ? "Reconnecting to the sanctuary…" : others
        ? `${others} other visitor${others === 1 ? "" : "s"} here with you.`
        : "You’re here. Other visitors will appear when they join.");
    };
    update(); EventBus.on("presence-updated", update);
    return () => { EventBus.off("presence-updated", update); };
  }, []);
  const stop = () => EventBus.emit("visitor-touch", { dx: 0, dy: 0 });
  return <div className="player-controls">
    <p className="shop-hint">Your character is labelled “You”. Focus the meadow, then use <strong>WASD or arrow keys</strong> to walk, or hold a direction below. Walk up to Potato or a building and press <strong>E</strong>; click the shared farm to grow food. Nearby bubbles can also be tapped.</p>
    <p className="presence-status" role="status">{status}</p>
    <div className="walk-buttons" role="group" aria-label="Walking controls">
      {([{ label: "Walk left", text: "←", dx: -1, dy: 0 }, { label: "Walk up", text: "↑", dx: 0, dy: -1 },
        { label: "Walk down", text: "↓", dx: 0, dy: 1 }, { label: "Walk right", text: "→", dx: 1, dy: 0 }]).map(direction =>
        <button key={direction.label} type="button" aria-label={direction.label}
          onPointerDown={event => { event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); EventBus.emit("visitor-touch", direction); }}
          onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
          onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); EventBus.emit("visitor-touch", direction); } }}
          onKeyUp={stop}>{direction.text}</button>)}
    </div>
  </div>;
}
