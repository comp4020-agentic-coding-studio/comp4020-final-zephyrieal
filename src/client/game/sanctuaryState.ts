import type { FurnitureRow } from "../../server/furniture.ts";

export interface FlowerRow {
  id: number;
  x: number;
  y: number;
  planted_at: string;
}

// The latest known server state, mirrored here so a Scene that starts (or
// restarts, e.g. switching back into IndoorScene) can draw immediately from
// whatever's already known, without waiting for a fresh "*-updated" event.
// useSanctuary.ts is the only writer; Scenes only read.
export const sanctuaryState = {
  flowers: [] as FlowerRow[],
  furniture: [] as FurnitureRow[],
};
