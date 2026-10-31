import type Phaser from "phaser";
// Development-only handle for browser QA; never used to control shared state.
export const gameRuntime: { current: Phaser.Game | null } = { current: null };
