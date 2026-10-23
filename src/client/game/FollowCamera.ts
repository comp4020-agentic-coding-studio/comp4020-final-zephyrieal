import Phaser from "phaser";
import { cameraState } from "./cameraState.ts";
import { presenceState } from "./presenceState.ts";
import { onSceneExit } from "./onSceneExit.ts";
import { MEADOW_WIDTH, MEADOW_HEIGHT } from "../../shared/interactions.ts";
export function configureCamera(scene: Phaser.Scene, outdoor: boolean) {
  const camera = scene.cameras.main;
  camera.setZoom(outdoor ? 2 : 1.25);
  if (outdoor) camera.setBounds(0, 0, MEADOW_WIDTH, MEADOW_HEIGHT);
  else camera.removeBounds();
  camera.centerOn(320, 256);
  let followedId = "";
  let focusX = 320, focusY = 256;
  const follow = (_time: number, delta: number) => {
    if (!outdoor) return;
    const avatar = scene.children.getByName(`visitor:${presenceState.selfId}`) as Phaser.GameObjects.Container | null;
    if (!avatar) return;
    // Follow the rendered feet after avatar interpolation, not the 20 Hz
    // network snapshots or the body's decorative walking bob.
    const x = avatar.x, y = avatar.y - 15;
    if (followedId !== presenceState.selfId) {
      followedId = presenceState.selfId;
      focusX = x; focusY = y;
    } else {
      const blend = 1 - Math.exp(-Math.min(delta, 100) / 80);
      focusX += (x - focusX) * blend;
      focusY += (y - focusY) * blend;
    }
    camera.centerOn(focusX, focusY);
  };
  const project = () => Object.assign(cameraState, { x: camera.worldView.x, y: camera.worldView.y, zoom: camera.zoom, width: camera.width, height: camera.height });
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, follow);
  scene.game.events.on(Phaser.Core.Events.POST_RENDER, project);
  onSceneExit(scene, () => { scene.events.off(Phaser.Scenes.Events.POST_UPDATE, follow); scene.game.events.off(Phaser.Core.Events.POST_RENDER, project); });
}
