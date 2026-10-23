import type { CarrotState } from "../../shared/carrot.ts";
import type { Room } from "../../shared/rooms.ts";
import type { FarmState } from "../../shared/farm.ts";
import type { FurnitureRow } from "../../server/furniture.ts";
import type { ConstructionSnapshot } from "../../server/construction.ts";
import type { GuineaPigMovement } from "../../server/guinea-pig.ts";

// The latest known server state, mirrored here so a Scene that starts (or
// restarts, e.g. switching back into IndoorScene) can draw immediately from
// whatever's already known, without waiting for a fresh "*-updated" event.
// useSanctuary.ts is the only writer; Scenes only read.
export const sanctuaryState = {
  room: "outdoor" as Room,
  carrot: null as CarrotState | null,
  carrotReceivedAt: 0,
  guineaPigs: {} as Record<string, { id: string; name: string; feed_count: number; movement: GuineaPigMovement; receivedAt: number }>,
  farm: null as FarmState | null,
  farmReceivedAt: 0,
  furniture: [] as FurnitureRow[],
  construction: {} as Record<string, ConstructionSnapshot>,
  guineaPigReceivedAt: 0,
  guineaPigMovement: null as GuineaPigMovement | null,
};
