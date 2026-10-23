export const CROPS = {
  hay: { carePoints: 10, name: "Hay", growMs: 30000, color: 0xd8b65c },
  lettuce: { carePoints: 15, name: "Lettuce", growMs: 45000, color: 0x8dbb68 },
  pepper: { carePoints: 25, name: "Bell peppers", growMs: 60000, color: 0xd77b62 },
  cucumber: { carePoints: 20, name: "Cucumbers", growMs: 45000, color: 0x619c65 },
} as const;
export type Crop = keyof typeof CROPS;
export const CROP_KEYS = Object.keys(CROPS) as Crop[];
export function isCrop(value: unknown): value is Crop { return typeof value === "string" && Object.hasOwn(CROPS, value); }
// One communal bed: planting never grants ownership.
export const FARM_PLOTS = [{ id: 0, x: 286, y: 188 }];
export const FARM_REACH = 96;
export interface FarmPlot { id: number; crop: Crop | null; plantedAt: number | null; readyAt: number | null; version: number }
export interface FarmState { plots: FarmPlot[]; food: Record<Crop, number>; serverNow: number }
