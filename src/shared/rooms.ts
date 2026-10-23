export const BUILDING_ROOMS = {
  "guinea-pig-house": { name: "Huahua's house", color: "#f7e7cb" },
  toolshed: { name: "The toolshed", color: "#ead7be" },
  greenhouse: { name: "The greenhouse", color: "#dcebd2" },
  "great-hall": { name: "The great hall", color: "#e5dded" },
} as const;
export type BuildingId = keyof typeof BUILDING_ROOMS;
export type Room = "outdoor" | "indoor" | `house:${BuildingId}`;
export function isBuilding(id: unknown): id is BuildingId { return typeof id === "string" && Object.hasOwn(BUILDING_ROOMS, id); }
export function isRoom(room: unknown): room is Room { return room === "outdoor" || room === "indoor" || typeof room === "string" && room.startsWith("house:") && isBuilding(room.slice(6)); }
export function roomName(room: Room) { return room.startsWith("house:") ? BUILDING_ROOMS[room.slice(6) as BuildingId].name : room === "indoor" ? "The shared shelter" : "The meadow"; }
