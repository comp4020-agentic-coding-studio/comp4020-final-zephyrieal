import { useState } from "react";
import { EventBus } from "../game/eventBus.ts";
import type { ConstructionSnapshot } from "../../server/construction.ts";

// The one piece of furniture-shop-style UI this feature needed that isn't a
// Phaser-canvas menu (unlike IndoorScene's furniture edit menu) --- a plain
// React overlay, same reasoning ShopPanel/StoragePanel already follow: no
// placement/preview step here, just one button whose click the server alone
// decides the outcome of (CLAUDE.md, "never trust a client-sent value for
// construction progress"). Native <button>s need no extra work for "desktop
// and mobile, no keyboard required."
export function ConstructionPanel({
  construction,
  onClose,
}: {
  construction: ConstructionSnapshot | null;
  onClose: () => void;
}) {
  const [pulsing, setPulsing] = useState(false);

  if (!construction) return null;

  const percent = Math.min(100, Math.floor((construction.progressUnits / construction.targetUnits) * 100));
  const multiplier = (construction.multiplierUnits / 100).toFixed(1);
  const builders = construction.activeBuilders;
  const finished = construction.status === "completed";

  function handleBuild() {
    setPulsing(true);
    window.setTimeout(() => setPulsing(false), 180);
    EventBus.emit("attempt-construction-contribute", { requestId: crypto.randomUUID() });
  }

  return (
    <div className="construction-panel" role="dialog" aria-label="Build the guinea pig house">
      <div className="construction-panel-header">
        <span>🏠 Building Potato's house</span>
        <button
          type="button"
          className="construction-panel-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {finished ? (
        <p className="construction-panel-done">
          The guinea pig house is ready! Thank you for building together!
        </p>
      ) : (
        <>
          <p className="construction-panel-progress-label">Construction: {percent}%</p>
          <div
            className="construction-progress-bar"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="construction-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="construction-panel-stats" aria-live="polite">
            👤 {builders} {builders === 1 ? "person" : "people"} building right now
            {builders >= 2 ? ` — ✨ building ${multiplier}× faster together` : null}
          </p>
          <button
            type="button"
            className={pulsing ? "construction-build-button construction-build-pulse" : "construction-build-button"}
            onClick={handleBuild}
          >
            🔨 Build!
          </button>
        </>
      )}
    </div>
  );
}
