// The guinea-pig-house construction site is the shared shelter's front door.
export const SHELTER_BUILDING = "guinea-pig-house";
export const BUILDING_ROOMS = {
  toolshed: { name: "The toolshed", color: "#ead7be" },
  greenhouse: { name: "The greenhouse", color: "#dcebd2" },
  "great-hall": { name: "The great hall", color: "#e5dded" },
} as const;
export type HouseId = keyof typeof BUILDING_ROOMS;
export type BuildingId = HouseId | typeof SHELTER_BUILDING;
export type Room = "outdoor" | "indoor" | `house:${HouseId}`;
const isHouse = (id: unknown): id is HouseId => typeof id === "string" && Object.hasOwn(BUILDING_ROOMS, id);
export function isBuilding(id: unknown): id is BuildingId { return id === SHELTER_BUILDING || isHouse(id); }
export function isRoom(room: unknown): room is Room { return room === "outdoor" || room === "indoor" || typeof room === "string" && room.startsWith("house:") && isHouse(room.slice(6)); }
export function buildingRoom(id: BuildingId): Room { return id === SHELTER_BUILDING ? "indoor" : `house:${id}`; }
export function roomBuilding(room: Room): BuildingId | undefined { return room === "indoor" ? SHELTER_BUILDING : room.startsWith("house:") ? room.slice(6) as HouseId : undefined; }
export function roomName(room: Room) { return room.startsWith("house:") ? BUILDING_ROOMS[room.slice(6) as HouseId].name : room === "indoor" ? "The shared shelter" : "The meadow"; }
