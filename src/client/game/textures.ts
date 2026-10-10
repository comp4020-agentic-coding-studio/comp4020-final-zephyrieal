import type Phaser from "phaser";

// The repo has zero image assets and no way to author real art this week ---
// procedural Phaser.GameObjects.Graphics -> generateTexture() placeholders
// are reliably implementable with no external tooling. Nearest-neighbour
// scaling is handled globally by the game config's `pixelArt: true`
// (see config.ts).
export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  g.clear().fillStyle(0xcfa773).fillRect(0, 0, 32, 32);
  g.lineStyle(1, 0xb8905c).strokeRect(0, 0, 32, 32);
  g.generateTexture("tile-floor", 32, 32);

  g.clear().fillStyle(0x5a4632).fillRect(0, 0, 32, 32);
  g.generateTexture("tile-wall", 32, 32);

  g.clear().fillStyle(0xead08a).fillRoundedRect(0, 0, 64, 64, 8);
  g.lineStyle(2, 0xc9a94e).strokeRoundedRect(0, 0, 64, 64, 8);
  g.generateTexture("furniture-hay_bed", 64, 64);

  g.clear().fillStyle(0x8a6d4b).fillEllipse(48, 16, 96, 32);
  g.generateTexture("furniture-tunnel", 96, 32);

  g.clear().fillStyle(0x6b5b95).fillRoundedRect(0, 0, 64, 64, 12);
  g.generateTexture("furniture-hideout", 64, 64);

  g.clear().fillStyle(0xffd23f).fillCircle(8, 8, 6);
  g.fillStyle(0xff6b6b).fillCircle(8, 8, 3);
  g.generateTexture("flower", 16, 16);

  g.clear().fillStyle(0xa0522d).fillEllipse(16, 12, 28, 18);
  g.fillCircle(6, 8, 7);
  g.generateTexture("guinea-pig", 32, 24);

  g.destroy();
}
