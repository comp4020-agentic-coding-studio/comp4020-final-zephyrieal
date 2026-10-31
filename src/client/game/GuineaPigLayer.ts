import type { Room } from "../../shared/rooms.ts";
import { roomDimensions } from "../../shared/interactions.ts";
import { onSceneExit } from "./onSceneExit.ts";
import Phaser from "phaser";
import { sanctuaryState } from "./sanctuaryState.ts";

export function addGuineaPigs(scene: Phaser.Scene, room: Room = "outdoor") {
  const sprites = new Map<string, { body: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  const update = () => {
    for (const [id, sprite] of sprites) {
      if ((sanctuaryState.guineaPigs[id]?.movement.room ?? "outdoor") !== room) {
        sprite.body.destroy(); sprite.label.destroy(); sprites.delete(id);
      }
    }
    for (const pig of Object.values(sanctuaryState.guineaPigs)) {
      if ((pig.movement.room ?? "outdoor") !== room) continue;
      let sprite = sprites.get(pig.id);
      if (!sprite) {
        const body = scene.add.image(0, 0, pig.id === "potato" ? "guinea-pig" : pig.id, pig.id === "potato" ? "potato" : "pig").setDepth(3);
        const size = room === "outdoor" ? 38 : 28;
        body.setDisplaySize(size, size * body.frame.height / body.frame.width);
        const label = scene.add.text(0, 0, pig.name, { fontFamily: "monospace", fontSize: "9px", color: "#37442e", backgroundColor: "#fff6df", padding: { x: 3, y: 1 } }).setOrigin(0.5, 0).setDepth(4);
        body.setName(`guinea-pig:${pig.id}`);
        sprite = { body, label }; sprites.set(pig.id, sprite);
      }
      const m = pig.movement;
      const remaining = Math.max(0, m.startedAt + m.durationMs - pig.receivedAt);
      const t = remaining ? Phaser.Math.Clamp((Date.now() - pig.receivedAt) / remaining, 0, 1) : 1;
      const {width:worldWidth,height:worldHeight}=roomDimensions(room);
      const x = (m.x + (m.targetX - m.x) * t) * worldWidth / 100;
      const y = (m.y + (m.targetY - m.y) * t) * worldHeight / 100;
      const activity = m.activity;
      const awakeKey = pig.id === "potato" ? "guinea-pig" : pig.id;
      const awakeFrame = pig.id === "potato" ? "potato" : "pig";
      const sleeping = activity === "resting";
      const textureKey = sleeping ? `${pig.id}-sleeping` : awakeKey;
      const frameName = sleeping ? "sleeping" : awakeFrame;
      if (sprite.body.texture.key !== textureKey) sprite.body.setTexture(textureKey, frameName);
      const size = room === "outdoor" ? 38 : 28;
      const height = size * sprite.body.frame.height / sprite.body.frame.width;
      const normal = scene.textures.getFrame(awakeKey, awakeFrame);
      const normalHeight = size * normal.height / normal.width;
      sprite.body.setDisplaySize(size, height).setPosition(x, y + (normalHeight - height) / 2);
      sprite.body.setAlpha(activity === "hiding" ? 0.25 : 1);
      sprite.body.setDepth(activity === "resting" ? 5 : 3);
      sprite.label.setDepth(6).setText(activity && activity !== "resting" ? `${pig.name} · ${activity === "hiding" ? "In the hideout" : "Exploring the tunnel"}` : pig.name);
      if (m.targetX !== m.x) sprite.body.setFlipX(m.targetX < m.x);
      sprite.label.setPosition(x, y + 15);
    }
  };
  update(); scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  onSceneExit(scene, () => { scene.events.off(Phaser.Scenes.Events.UPDATE, update); sprites.clear(); });
}
