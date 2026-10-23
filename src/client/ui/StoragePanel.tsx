import type { FurnitureRow } from "../../server/furniture.ts";
import { EventBus } from "../game/eventBus.ts";
import furnitureSheet from "../assets/sprites/furniture-cozy.png";
const ROWS: Record<string, string> = { hay_bed: "0%", tunnel: "50%", hideout: "100%" };

const LABELS: Record<string, string> = {
  hay_bed: "Hay bed",
  tunnel: "Wooden tunnel",
  hideout: "Hideout",
};

// A piece a visitor stores doesn't belong to them any more than one they
// bought does (CLAUDE.md, "nobody owns anything") --- anyone can pick it back
// up here, for free, same as the furniture shop's own buy flow but with no
// cost. Nothing rendered when storage is empty --- there's nothing to say.
export function StoragePanel({ items }: { items: FurnitureRow[] }) {
  if (items.length === 0) return null;

  return (
    <div className="storage-panel">
      <p className="storage-hint">Shared storage — free for anyone to place.</p>
      <ul className="storage-list">
        {items.map((item) => (
          <li key={item.id} className="storage-item">
            <span aria-hidden="true" style={{ width: 40, height: 40, flexShrink: 0, backgroundImage: `url(${furnitureSheet})`, backgroundSize: "300% 300%", backgroundPosition: `0% ${ROWS[item.kind]}` }} />
            <span>
              {LABELS[item.kind] ?? item.kind} ({item.width}×{item.height})
            </span>
            <button type="button" onClick={() => EventBus.emit("select-stored-furniture", item)}>
              Place — free
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
