import Phaser from "phaser";
// A scene can be destroyed directly during a game remount without shutdown.
export function onSceneExit(scene: Phaser.Scene, cleanup: () => void) {
  const once = () => {
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, once);
    scene.events.off(Phaser.Scenes.Events.DESTROY, once);
    cleanup();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, once);
  scene.events.once(Phaser.Scenes.Events.DESTROY, once);
}
