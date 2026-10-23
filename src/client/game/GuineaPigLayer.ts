import { MEADOW_WIDTH, MEADOW_HEIGHT } from "../../shared/interactions.ts";
import { onSceneExit } from "./onSceneExit.ts";
import Phaser from "phaser";
import { sanctuaryState } from "./sanctuaryState.ts";

export function addGuineaPigs(scene: Phaser.Scene) {
  const sprites = new Map<string, { body: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  const update = () => {
    for (const pig of Object.values(sanctuaryState.guineaPigs)) {
      let sprite = sprites.get(pig.id);
      if (!sprite) {
        const body = scene.add.image(0, 0, pig.id === "potato" ? "guinea-pig" : pig.id, pig.id === "potato" ? "potato" : "pig").setDepth(3);
        body.setDisplaySize(38, 38 * body.frame.height / body.frame.width);
        const label = scene.add.text(0, 0, pig.name, { fontFamily: "monospace", fontSize: "9px", color: "#37442e", backgroundColor: "#fff6df", padding: { x: 3, y: 1 } }).setOrigin(0.5, 0).setDepth(4);
        body.setName(`guinea-pig:${pig.id}`);
        sprite = { body, label }; sprites.set(pig.id, sprite);
      }
      const m = pig.movement;
      const remaining = Math.max(0, m.startedAt + m.durationMs - pig.receivedAt);
      const t = remaining ? Phaser.Math.Clamp((Date.now() - pig.receivedAt) / remaining, 0, 1) : 1;
      const x = (m.x + (m.targetX - m.x) * t) * MEADOW_WIDTH / 100;
      const y = (m.y + (m.targetY - m.y) * t) * MEADOW_HEIGHT / 100;
      sprite.body.setPosition(x, y);
      if (m.targetX !== m.x) sprite.body.setFlipX(m.targetX < m.x);
      sprite.label.setPosition(x, y + 15);
    }
  };
  update(); scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  onSceneExit(scene, () => { scene.events.off(Phaser.Scenes.Events.UPDATE, update); sprites.clear(); });
}
