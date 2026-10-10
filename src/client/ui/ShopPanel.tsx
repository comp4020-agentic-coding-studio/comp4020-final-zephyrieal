import { FURNITURE_CATALOG, type FurnitureKind } from "../../server/furniture.ts";
import { EventBus } from "../game/eventBus.ts";

const LABELS: Record<FurnitureKind, string> = {
  hay_bed: "Hay bed",
  tunnel: "Wooden tunnel",
  hideout: "Hideout",
};

export function ShopPanel({ carePoints }: { carePoints: number }) {
  return (
    <div className="shop-panel">
      <p className="shop-hint">
        Pick a piece, then click (or arrow keys + Enter) inside the house to place it.
      </p>
      <ul className="shop-list">
        {(Object.keys(FURNITURE_CATALOG) as FurnitureKind[]).map((kind) => {
          const def = FURNITURE_CATALOG[kind];
          const affordable = carePoints >= def.cost;
          return (
            <li key={kind}>
              <button
                type="button"
                disabled={!affordable}
                title={affordable ? undefined : "not enough care points yet"}
                onClick={() => EventBus.emit("select-furniture", kind)}
              >
                {LABELS[kind]} — {def.cost}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
