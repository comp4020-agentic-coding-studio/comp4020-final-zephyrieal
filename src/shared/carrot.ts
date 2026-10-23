export const GIANT_CARROT = { x: 400, y: 300, reach: 58, pullMs: 3000, regrowMs: 30000, leaseMs: 15000 };
export interface CarrotState {
  round: number; readyAt: number; harvests: number;
  pullers: string[]; progressMs: number; serverNow: number;
}
