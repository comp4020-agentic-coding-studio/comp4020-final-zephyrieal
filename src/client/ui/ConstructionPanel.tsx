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
  projectId,
  projectName,
  construction,
  onClose,
}: {
  projectId: string;
  projectName: string;
  construction: ConstructionSnapshot | null;
  onClose: () => void;
}) {
  const [pulsing, setPulsing] = useState(false);

  if (!construction) return null;

  // The exact percent, not floored --- for the newer, much larger projects
  // (toolshed/greenhouse/bridge/great-hall, see ADR 004) a single click is
  // worth as little as 0.005%, so flooring to a whole number made real,
  // server-recorded progress invisible for dozens of clicks at a time ---
  // reported as "the progress bar doesn't increase when you build together"
  // even though construction.progressUnits was climbing the entire time.
  // Showing more decimal places below 10% keeps every real contribution
  // visibly reflected, while staying a whole number once it's large enough
  // that the extra precision wouldn't be noticed anyway.
  const exactPercent = Math.min(100, (construction.progressUnits / construction.targetUnits) * 100);
  const percentLabel =
    exactPercent === 0
      ? "0"
      : exactPercent < 0.01
        ? "<0.01"
        : exactPercent < 10
          ? exactPercent.toFixed(2)
          : Math.floor(exactPercent).toString();
  const multiplier = (construction.multiplierUnits / 100).toFixed(1);
  const builders = construction.activeBuilders;
  const finished = construction.status === "completed";

  function handleBuild() {
    setPulsing(true);
    window.setTimeout(() => setPulsing(false), 180);
    EventBus.emit("attempt-construction-contribute", { projectId, requestId: crypto.randomUUID() });
  }

  return (
    <div className="construction-panel" role="dialog" aria-label={`Build ${projectName}`}>
      <div className="construction-panel-header">
        <span>🏠 Building {projectName}</span>
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
        <p className="construction-panel-done">{projectName} is ready! Thank you for building together!</p>
      ) : (
        <>
          <p className="construction-panel-progress-label">Construction: {percentLabel}%</p>
          <div
            className="construction-progress-bar"
            role="progressbar"
            aria-valuenow={Math.round(exactPercent * 100) / 100}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="construction-progress-fill" style={{ width: `${exactPercent}%` }} />
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
